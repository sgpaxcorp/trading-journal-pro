import TopNav from "@/app/components/TopNav";
import OrderHistoryAuditPanel from "./OrderHistoryAuditPanel";

export default function OrderHistoryAuditPage() {
  return (
    <div className="min-h-screen text-slate-100" style={{ backgroundColor: "#0b1020" }}>
      <TopNav />
      <OrderHistoryAuditPanel />
    </div>
  );
}
