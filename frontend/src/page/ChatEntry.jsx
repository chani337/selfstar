import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ChatGateModal from "@/components/ChatGateModal";

export default function ChatEntry() {
  const [open, setOpen] = useState(true);
  const nav = useNavigate();

  useEffect(() => {
    // 로그인 체크 필요 시 여기에 추가 (쿠키/토큰 확인 등)
  }, []);

  if (!open) return null;

  return (
    <ChatGateModal
      onCancel={() => nav('/')}
      onConfirm={() => {
        setOpen(false);
        nav("/chat/room", { replace: true });
      }}
    />
  );
}