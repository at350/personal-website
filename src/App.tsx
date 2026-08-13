import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from "react-router";
import {
  bookLocationForSpread,
  isKnownRoute,
  spreadForBookLocation,
} from "./magazine/folio";

/* The WebGL book (three.js and friends) loads only when the book is shown —
   reader-mode visitors never pay for it. */
const BookStage = lazy(() =>
  import("./book3d/BookStage").then((m) => ({ default: m.BookStage })),
);
import { useViewportMode } from "./magazine/useViewportMode";
import { ReaderView } from "./routes/ReaderView";
import { WritingPage } from "./routes/WritingPage";
import { NotFound } from "./routes/NotFound";
import { applyMeta } from "./lib/meta";
import { routerBasename } from "./lib/basePath";
import { CursorOrb } from "./components/CursorOrb";
import {
  ExperienceDock,
  type ExperienceMode,
} from "./components/ExperienceDock";
import { IgniteCursor } from "./components/IgniteCursor";

function IssueView() {
  const location = useLocation();
  const [mode, setPreference] = useViewportMode();

  if (!isKnownRoute(location.pathname)) return <NotFound />;
  if (mode === "reader") {
    return (
      <ReaderView
        canOpenBook={window.innerWidth >= 900}
        onOpenBook={() => setPreference("book")}
      />
    );
  }
  return <BookView />;
}

function BookView() {
  const location = useLocation();
  const navigate = useNavigate();
  const target = spreadForBookLocation(location.pathname, location.state);
  const [experienceMode, setExperienceMode] =
    useState<ExperienceMode>("read");

  const onSettled = useCallback(
    (index: number) => {
      const destination = bookLocationForSpread(index);
      if (destination.pathname !== location.pathname || target !== index) {
        navigate(destination.pathname, {
          replace: true,
          state: destination.state,
        });
      }
    },
    [location.pathname, navigate, target],
  );

  return (
    <>
      <Suspense fallback={<div style={{ minHeight: "100vh", background: "#fff" }} />}>
        <BookStage
          targetSpread={target}
          onSpreadSettled={onSettled}
          experienceMode={experienceMode}
        />
      </Suspense>
      {experienceMode === "ignite" ? <IgniteCursor /> : null}
      <ExperienceDock
        mode={experienceMode}
        onModeChange={setExperienceMode}
      />
    </>
  );
}

function ReaderRoute() {
  const navigate = useNavigate();
  const [, setPreference] = useViewportMode();
  return (
    <ReaderView
      canOpenBook={window.innerWidth >= 900}
      onOpenBook={() => {
        setPreference("book");
        navigate("/");
      }}
    />
  );
}

function Meta() {
  const location = useLocation();
  useEffect(() => {
    applyMeta(location.pathname);
  }, [location.pathname]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter basename={routerBasename()}>
      <Meta />
      <Routes>
        <Route path="/writing/:slug" element={<WritingPage />} />
        <Route path="/reader" element={<ReaderRoute />} />
        <Route path="*" element={<IssueView />} />
      </Routes>
      <div className="grain" aria-hidden />
      <CursorOrb />
    </BrowserRouter>
  );
}
