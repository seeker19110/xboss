import { redirect } from "next/navigation";

// Trang đơn đặt hàng đã chuyển sang /procurement?tab=orders.
export default function OrderPage() {
  redirect("/procurement?tab=orders");
}
