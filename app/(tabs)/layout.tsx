import { AddSheet, AddSheetProvider } from "@/components/AddSheet";
import { AuthGate } from "@/components/AuthGate";
import { TabBar } from "@/components/TabBar";

export default function TabsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <AddSheetProvider>
        {children}
        <AddSheet />
        <TabBar />
      </AddSheetProvider>
    </AuthGate>
  );
}
