import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-green-700 text-3xl text-white">
        ⚽
      </div>
      <h1 className="text-3xl font-bold tracking-tight">League Tracker</h1>
      <p className="mt-3 text-gray-600">
        Add your teams, get the fixtures automatically, enter scores after each game and watch the table update. Share
        one link so everyone can follow along.
      </p>

      <ul className="mt-6 space-y-2 text-sm text-gray-700">
        <li>• Fixtures generated for you (single or double round-robin)</li>
        <li>• Standings by points, goal difference and goals scored</li>
        <li>• Results saved for later, exportable as CSV</li>
        <li>• View-only link for participants</li>
      </ul>

      <Link
        href="/admin"
        className="mt-8 rounded-xl bg-green-700 px-5 py-3 text-center font-semibold text-white shadow-sm active:bg-green-800"
      >
        Admin sign in
      </Link>
      <p className="mt-4 text-center text-xs text-gray-500">
        Participants: open the link your organiser shared with you.
      </p>
    </main>
  );
}
