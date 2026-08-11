import { useCallback } from "react";
import { BrowserRouter, useLocation, useNavigate } from "react-router";
import { Magazine } from "./magazine/Magazine";
import { routeForSpread, spreadForRoute } from "./magazine/folio";

function MagazineRoutes() {
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

export default function App() {
  return (
    <BrowserRouter>
      <MagazineRoutes />
      <div className="grain" aria-hidden />
    </BrowserRouter>
  );
}
