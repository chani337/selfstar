// src/page/AuthSuccess.jsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function AuthSuccess() {
  const navigate = useNavigate();

  useEffect(() => {
    // 1️⃣ 세션 확인
    fetch("https://selfstar.duckdns.org/api/auth/me", {
      method: "GET",
      credentials: "include",
    })
      .then((res) => {
        if (!res.ok) throw new Error("세션 없음");
        return res.json();
      })
      .then((data) => {
        console.log("세션 확인:", data);
        // 2️⃣ 세션이 있으면 메인으로 이동
        if (data?.authenticated) {
          navigate("/", { replace: true });
        } else {
          navigate("/signup", { replace: true });
        }
      })
      .catch(() => {
        // 에러 시 로그인 페이지로 이동
        navigate("/signup", { replace: true });
      });
  }, [navigate]);

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      height: "100vh", flexDirection: "column", textAlign: "center"
    }}>
      <h2 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>로그인 확인 중...</h2>
      <p style={{ color: "#666" }}>잠시만 기다려주세요 😊</p>
    </div>
  );
}

