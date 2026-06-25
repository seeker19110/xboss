'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import OrderContent from '@/app/order/OrderContent';

function PurchaseOrdersFormInner() {
  const searchParams = useSearchParams();
  const isEmbed = searchParams.get('embed') === '1';
  return <OrderContent isEmbed={isEmbed} />;
}

export default function PurchaseOrdersFormPage() {
  return (
    <Suspense>
      <PurchaseOrdersFormInner />
    </Suspense>
  );
}
