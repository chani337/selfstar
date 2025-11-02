import os
import base64
import re
import mimetypes
import logging
from datetime import datetime
from functools import lru_cache
from typing import Optional, Tuple


log = logging.getLogger("s3")


def _env(name: str, default: Optional[str] = None) -> Optional[str]:
    v = os.getenv(name)
    return v if v not in {None, ""} else default


def s3_enabled() -> bool:
    """최소한의 S3 설정이 갖춰졌는지 여부 반환.

    버킷/액세스/시크릿 키가 필요합니다. 엔드포인트/리전은 NCP 오브젝트 스토리지 기본값을 사용합니다.
    """
    return bool(
        _env("NCP_S3_BUCKET")
        and _env("NCP_S3_ACCESS_KEY")
        and _env("NCP_S3_SECRET_KEY")
    )


@lru_cache(maxsize=1)
def get_s3_client():
    """NCP 오브젝트 스토리지에 맞춰 설정된 boto3 S3 클라이언트를 생성/캐시합니다.

    실제 사용 시점에 지연 임포트하여 테스트 시 불필요한 의존성을 줄입니다.
    """
    if not s3_enabled():
        raise RuntimeError("S3 not enabled/configured")
    try:
        import boto3  # type: ignore
    except Exception as e:
        raise RuntimeError(f"boto3 not available: {e}")

    endpoint = _env("NCP_S3_ENDPOINT", "https://kr.object.ncloudstorage.com")
    region = _env("NCP_S3_REGION", "kr-standard")
    access_key = _env("NCP_S3_ACCESS_KEY")
    secret_key = _env("NCP_S3_SECRET_KEY")

    session = boto3.session.Session()
    s3 = session.client(
        "s3",
        endpoint_url=endpoint,
        region_name=region,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
    )
    return s3


def _guess_ext_and_content_type(mime: str) -> Tuple[str, str]:
    ext = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/webp": ".webp",
        "image/svg+xml": ".svg",
    }.get(mime)
    if not ext:
        ext = mimetypes.guess_extension(mime) or ".bin"
    return ext, mime or "application/octet-stream"


def _parse_data_uri(data_uri: str) -> Tuple[bytes, str, str]:
    m = re.match(r"^data:(.*?);base64,(.*)$", data_uri)
    if not m:
        raise ValueError("invalid_data_uri")
    mime, b64 = m.groups()
    raw = base64.b64decode(b64)
    ext, content_type = _guess_ext_and_content_type(mime)
    return raw, ext, content_type


def _sanitize_prefix(p: Optional[str]) -> Optional[str]:
    if not p:
        return None
    # 슬래시 정규화
    p = p.replace("\\", "/").strip("/")
    if not p:
        return None
    # 상위 경로 이동 금지
    if ".." in p.split("/"):
        raise ValueError("invalid_prefix")
    # 세그먼트별 안전한 문자만 허용
    import re as _re
    parts = []
    for seg in p.split("/"):
        if not seg:
            continue
        if not _re.match(r"^[A-Za-z0-9._-]{1,100}$", seg):
            # 허용되지 않는 문자는 '-'로 치환
            cleaned = _re.sub(r"[^A-Za-z0-9._-]", "-", seg)[:100]
            if not cleaned:
                continue
            seg = cleaned
        parts.append(seg)
    return "/".join(parts) if parts else None


def put_data_uri(
    data_uri: str,
    model: Optional[str] = None,
    key_prefix: Optional[str] = None,
    base_prefix: Optional[str] = None,
    include_model: bool = True,
    include_date: bool = True,
) -> str:
    """data URI를 S3로 업로드하고 오브젝트 키를 반환합니다.

    키 형식: {prefix}/{model?}/{YYYYMMDD}/gen_{ts}{ext}
    prefix 기본값은 환경변수 NCP_S3_PREFIX(없으면 'dev').
    """
    if not s3_enabled():
        raise RuntimeError("S3 not enabled/configured")

    raw, ext, content_type = _parse_data_uri(data_uri)
    s3 = get_s3_client()
    bucket = _env("NCP_S3_BUCKET")

    # 기본 prefix 결정: 전달값이 우선, 빈 문자열은 기본 prefix 비활성화
    if base_prefix is None:
        resolved_base = _env("NCP_S3_PREFIX", "dev")
    else:
        # 호출자가 빈 문자열을 주면 기본 prefix 비활성화로 간주
        resolved_base = base_prefix
    resolved_base = _sanitize_prefix(resolved_base) if resolved_base is not None else None

    sub_prefix = _sanitize_prefix(key_prefix)
    if resolved_base and sub_prefix:
        prefix = f"{resolved_base.rstrip('/')}/{sub_prefix}"
    else:
        prefix = sub_prefix or resolved_base
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    # 파일 기본 이름: 타임스탬프 기반
    base_name = f"gen_{ts}"
    date_part = datetime.utcnow().strftime("%Y%m%d")
    parts = [prefix]
    if include_model and model:
        parts.append(model)
    if include_date:
        parts.append(date_part)
    parts = [p for p in parts if p]
    key_dir = "/".join(parts) if parts else ""
    key = f"{key_dir}/{base_name}{ext}" if key_dir else f"{base_name}{ext}"

    extra_args = {"ContentType": content_type}
    sse = _env("NCP_S3_SSE")
    if sse:
        # 예: 'AES256' 또는 'aws:kms' (버킷 정책으로 KMS 키 설정)
        extra_args["ServerSideEncryption"] = sse

    s3.put_object(Bucket=bucket, Key=key, Body=raw, **extra_args)
    log.info("Uploaded object to s3: s3://%s/%s (%s)", bucket, key, content_type)
    return key


def presign_get_url(key: str, expires_in: Optional[int] = None) -> str:
    if not s3_enabled():
        raise RuntimeError("S3 not enabled/configured")
    s3 = get_s3_client()
    bucket = _env("NCP_S3_BUCKET")
    if expires_in is None:
        try:
            expires_in = int(_env("PRESIGN_DEFAULT_EXPIRES", "3600"))
        except Exception:
            expires_in = 3600
    url = s3.generate_presigned_url(
        ClientMethod="get_object",
        Params={"Bucket": bucket, "Key": key},
        ExpiresIn=expires_in,
    )
    return url


def delete_object(key: str) -> bool:
    """Delete an object by key. Returns True if no exception was raised.

    If S3 is not enabled, this is a no-op and returns False (to signal nothing happened).
    """
    if not s3_enabled():
        return False
    try:
        s3 = get_s3_client()
        bucket = _env("NCP_S3_BUCKET")
        s3.delete_object(Bucket=bucket, Key=key)
        log.info("Deleted object from s3: s3://%s/%s", bucket, key)
        return True
    except Exception as e:
        log.warning("Failed to delete s3 object %s: %s", key, e)
        return False
