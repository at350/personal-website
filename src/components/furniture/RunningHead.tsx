import "@/styles/furniture.css";

interface RunningHeadProps {
  text: string;
  side: "verso" | "recto";
}

export function RunningHead({ text, side }: RunningHeadProps) {
  return (
    <p className={`running-head running-head--${side} mono-label`} aria-hidden>
      {text}
    </p>
  );
}
