import { redirect } from 'next/navigation';

// Trang đơn đặt hàng đã chuyển sang /materials/order-form.
export default function OrderPage() {
  redirect('/materials/order-form');
}
