import { useChatStore } from "../store/useChatStore";
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

import Sidebar from "../components/Sidebar";
import AwayDigestModal from "../components/AwayDigestModal";
import { useDigestStore } from "../store/useDigestStore";
import { useAuthStore } from "../store/useAuthStore";
import NoChatSelected from "../components/NoChatSelected";
import ChatContainer from "../components/ChatContainer";

const HomePage = () => {
  const { selectedUser, setSelectedUser, users } = useChatStore();
  const [searchParams, setSearchParams] = useSearchParams();

  const { fetchDigest } = useDigestStore();
  const busyEnd = useAuthStore((state) => state.authUser?.busyEnd);

  // Show the away summary on arrival, when the tab regains focus, and when a scheduled busy period ends
  useEffect(() => {
    fetchDigest({ force: true });
    const onVisible = () => document.visibilityState === "visible" && fetchDigest();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [fetchDigest]);

  useEffect(() => {
    const msUntilFree = busyEnd ? new Date(busyEnd).getTime() - Date.now() : -1;
    if (msUntilFree <= 0 || msUntilFree > 24 * 60 * 60 * 1000) return;
    const timer = setTimeout(() => fetchDigest({ force: true }), msUntilFree + 5000);
    return () => clearTimeout(timer);
  }, [busyEnd, fetchDigest]);

  // Alerts link to /?chat=<userId> so tapping one opens that conversation
  const chatParam = searchParams.get("chat");
  useEffect(() => {
    if (!chatParam || users.length === 0) return;
    const contact = users.find((u) => u._id === chatParam);
    if (contact) setSelectedUser(contact);
    setSearchParams({}, { replace: true });
  }, [chatParam, users, setSelectedUser, setSearchParams]);

  useEffect(() => {
    return () => {
      setSelectedUser(null);
    };
  }, [setSelectedUser]);

  return (
    <div className="h-screen bg-base-200">
      <div className="flex items-center justify-center pt-20 px-4">
        <div className="bg-base-100 rounded-lg shadow-cl w-full max-w-6xl h-[calc(100vh-8rem)]">
          <div className="flex h-full rounded-lg overflow-hidden">
            <Sidebar />

            {!selectedUser ? <NoChatSelected /> : <ChatContainer />}
            <AwayDigestModal />
          </div>
        </div>
      </div>
    </div>
  );
};
export default HomePage;
