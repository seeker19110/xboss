import { Button } from "@/app/components/ui";

export default function SourceNotice({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-rose-800 bg-zinc-900 p-3 text-sm text-rose-300 flex flex-wrap items-center gap-3"
    >
      <p className="min-w-0 flex-1 wrap-anywhere">{message}</p>
      <Button variant="secondary" className="min-h-11" onClick={retry}>
        Thử lại
      </Button>
    </div>
  );
}
