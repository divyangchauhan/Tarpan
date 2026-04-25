import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';

interface ActiveCaseContextValue {
  activeCaseName: string | null;
  setActiveCaseName: (name: string | null) => void;
}

const ActiveCaseContext = createContext<ActiveCaseContextValue>({
  activeCaseName: null,
  setActiveCaseName: () => {},
});

export function ActiveCaseProvider({ children }: { children: ReactNode }): JSX.Element {
  const [activeCaseName, setActiveCaseNameState] = useState<string | null>(null);

  const setActiveCaseName = useCallback((name: string | null) => {
    setActiveCaseNameState(name);
  }, []);

  return (
    <ActiveCaseContext.Provider value={{ activeCaseName, setActiveCaseName }}>
      {children}
    </ActiveCaseContext.Provider>
  );
}

export function useActiveCase(): ActiveCaseContextValue {
  return useContext(ActiveCaseContext);
}
