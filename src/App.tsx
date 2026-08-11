import { useCallback, useEffect } from "react";
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from "react-router";
import { Magazine } from "./magazine/Magazine";
import { isKnownRoute, routeForSpread, spreadForRoute } from "./magazine/folio";
import { useViewportMode } from "./magazine/useViewportMode";
import { ReaderView } from "./routes/ReaderView";
import { WritingPage } from "./routes/WritingPage";
import { NotFound } from "./routes/NotFound";
import { applyMeta } from "./lib/meta";

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

  return <Magazine targetSpread={target} onSpreadSettled={onSettled} />;
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
    <BrowserRouter>
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
