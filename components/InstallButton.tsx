"use client";

import { useEffect, useState } from "react";

// Chrome/Edge/Android fire this before offering to install the app.
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iPadOs = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/.test(ua) || iPadOs;
}

/**
 * "Install app" button. Uses the browser's own install prompt where it exists
 * (Android Chrome, Edge, desktop Chrome). On iPhone/iPad, which has no install
 * prompt, it shows the Add to Home Screen steps. It hides itself once the app
 * is installed or when opened from the installed app.
 */
export default function InstallButton() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  const [help, setHelp] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setInstalled(isStandalone());
    setIos(isIos());

    const onPrompt = (e: Event) => {
      e.preventDefault(); // keep the prompt so our button can show it
      setPromptEvent(e as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!mounted || installed) return null;

  async function install() {
    if (promptEvent) {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setPromptEvent(null);
      return;
    }
    // No native prompt (iPhone, or the browser has not offered one yet): show the manual steps.
    setHelp((v) => !v);
  }

  return (
    <div className="mt-8 border-t border-gray-200 pt-6">
      <button
        type="button"
        onClick={install}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-green-700 bg-white px-4 py-3 font-semibold text-green-800 active:bg-green-50"
      >
        <span aria-hidden>⬇</span> Install app
      </button>

      {help && (
        <div className="mt-3 rounded-xl bg-green-50 p-3 text-sm text-green-900">
          {ios ? (
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                Open this page in <b>Safari</b>.
              </li>
              <li>
                Tap the <b>Share</b> button (the square with an arrow).
              </li>
              <li>
                Choose <b>Add to Home Screen</b>, then <b>Add</b>.
              </li>
            </ol>
          ) : (
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                Open this page in <b>Chrome</b> or <b>Edge</b> (not inside another app&apos;s browser).
              </li>
              <li>
                Open the browser menu (<b>⋮</b>) and choose <b>Install app</b> or <b>Add to Home screen</b>.
              </li>
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
