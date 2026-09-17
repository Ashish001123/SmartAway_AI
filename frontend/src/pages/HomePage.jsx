import { useChatStore } from "../store/useChatStore";
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

import Sidebar from "../components/Sidebar";
import NoChatSelected from "../components/NoChatSelected";
import ChatContainer from "../components/ChatContainer";

const HomePage = () => {
  const { selectedUser, setSelectedUser, users } = useChatStore();
  const [searchParams, setSearchParams] = useSearchParams();

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
          </div>
        </div>
      </div>
    </div>
  );
};
export default HomePage;
