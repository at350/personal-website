import { Suspense, lazy, useCallback, useEffect } from "react";
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from "react-router";
import { isKnownRoute, routeForSpread, spreadForRoute } from "./magazine/folio";

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
  const target = spreadForRoute(location.pathname);

  const onSettled = useCallback(
    (index: number) => {
      const route = routeForSpread(index);
      if (route !== location.pathname) navigate(route, { replace: true });
    },
    [location.pathname, navigate],
  );

  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "#fff" }} />}>
      <BookStage targetSpread={target} onSpreadSettled={onSettled} />
    </Suspense>
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
    </BrowserRouter>
  );
}
