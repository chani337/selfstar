import { Routes, Route, Navigate } from "react-router-dom";
import ChatEntry from "@/page/ChatEntry";
import Profiles from "@/page/Profiles";
import Dashboard from "@/page/Dashboard.jsx";
import PostInsightDetail from "@/page/PostInsightDetail.jsx";
import MyPage from "@/page/MyPage.jsx";

export default function App() {
  return (
    <>
      {/* ...existing layout... */}
      <Routes>
        {/* ...existing routes... */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/dashboard/post-insights" element={<Dashboard />} />
        <Route path="/dashboard/post-insights/:id" element={<PostInsightDetail />} />
        <Route path="/mypage" element={<MyPage />} />
        <Route path="/profiles" element={<Profiles />} />
        <Route path="/chat" element={<ChatEntry />} />
        <Route path="/chat/room" element={<div className="p-6">채팅 화면(구현 연결)</div>} />
      </Routes>
    </>
  );
}