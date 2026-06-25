import { redirect } from 'next/navigation';

// Trang đơn đặt hàng đã chuyển sang /materials/PurchaseOrders.
export default function OrderPage() {
  redirect('/materials/PurchaseOrders');
}
