import { useCallback, useState } from "react";
import { Magazine } from "./magazine/Magazine";

export default function App() {
  const [target, setTarget] = useState(0);
  const onSettled = useCallback((index: number) => setTarget(index), []);
  return (
    <>
      <Magazine targetSpread={target} onSpreadSettled={onSettled} />
      <div className="grain" aria-hidden />
    </>
  );
}
