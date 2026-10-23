export function BrandMark({ className = "size-10" }: { className?: string }) {
  return (
    <img
      src="/favicon.svg"
      alt=""
      width={512}
      height={512}
      className={`${className} shrink-0`}
    />
  );
}
