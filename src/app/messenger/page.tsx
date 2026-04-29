import type { Metadata } from "next";

import MessengerDemoApp from "@/components/messenger-demo-app";

export const metadata: Metadata = {
  title: "NULL Messenger Lab",
  description: "NULL로 만든 친구, 대화, 알림, 보이스톡 메신저 데모",
};

export default function MessengerPage() {
  return <MessengerDemoApp />;
}
