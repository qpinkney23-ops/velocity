export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="v-card p-5">
        <div className="h-4 w-40 rounded-lg bg-gray-200 animate-pulse" />
        <div className="mt-3 h-3 w-72 rounded-lg bg-gray-200 animate-pulse" />
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="v-card p-5 space-y-3">
            <div className="h-3 w-24 rounded-lg bg-gray-200 animate-pulse" />
            <div className="h-7 w-28 rounded-lg bg-gray-200 animate-pulse" />
            <div className="h-3 w-40 rounded-lg bg-gray-200 animate-pulse" />
          </div>
        ))}
      </div>

      <div className="v-card overflow-hidden">
        <div className="p-4 border-b" style={{ borderColor: "var(--v-border)" }}>
          <div className="h-3 w-28 rounded-lg bg-gray-200 animate-pulse" />
        </div>

        <div className="p-4 space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gray-200 animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-56 rounded-lg bg-gray-200 animate-pulse" />
                <div className="h-3 w-40 rounded-lg bg-gray-200 animate-pulse" />
              </div>
              <div className="h-8 w-20 rounded-xl bg-gray-200 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
