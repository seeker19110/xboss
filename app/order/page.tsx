'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import OrderContent from './OrderContent';

function OrderPageInner() {
  const searchParams = useSearchParams();
  const isEmbed = searchParams.get('embed') === '1';
  return <OrderContent isEmbed={isEmbed} />;
}

export default function OrderPage() {
  return (
    <Suspense>
      <OrderPageInner />
    </Suspense>
  );
}
