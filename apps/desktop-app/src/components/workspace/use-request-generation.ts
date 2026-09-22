import { useCallback, useLayoutEffect, useRef } from "react";

/** Latest request wins; invalidates success, error and finally paths on entity unmount. */
export function useRequestGeneration() {
  const generation = useRef(0);
  useLayoutEffect(() => () => { generation.current++; }, []);
  return useCallback(() => {
    const request = ++generation.current;
    return () => request === generation.current;
  }, []);
}
