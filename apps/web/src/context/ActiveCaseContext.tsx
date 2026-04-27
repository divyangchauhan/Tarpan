import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';

interface ActiveCaseContextValue {
  activeCaseName: string | null;
  setActiveCaseName: (name: string | null) => void;
  docUploaded: boolean;
  setDocUploaded: (value: boolean) => void;
  docProcessed: boolean;
  setDocProcessed: (value: boolean) => void;
  hasReadyDocs: boolean;
  setHasReadyDocs: (value: boolean) => void;
}

const ActiveCaseContext = createContext<ActiveCaseContextValue>({
  activeCaseName: null,
  setActiveCaseName: () => {},
  docUploaded: false,
  setDocUploaded: () => {},
  docProcessed: false,
  setDocProcessed: () => {},
  hasReadyDocs: false,
  setHasReadyDocs: () => {},
});

export function ActiveCaseProvider({ children }: { children: ReactNode }): JSX.Element {
  const [activeCaseName, setActiveCaseNameState] = useState<string | null>(null);
  const [docUploaded, setDocUploadedState] = useState(false);
  const [docProcessed, setDocProcessedState] = useState(false);
  const [hasReadyDocs, setHasReadyDocsState] = useState(false);

  const setActiveCaseName = useCallback((name: string | null) => {
    setActiveCaseNameState(name);
  }, []);

  // Flags are one-way: once set to true they stay true for the session.
  // This preserves sidebar access when navigating back to earlier pages.
  const setDocUploaded = useCallback((value: boolean) => {
    if (value) setDocUploadedState(true);
  }, []);

  const setDocProcessed = useCallback((value: boolean) => {
    if (value) setDocProcessedState(true);
  }, []);

  const setHasReadyDocs = useCallback((value: boolean) => {
    if (value) setHasReadyDocsState(true);
  }, []);

  return (
    <ActiveCaseContext.Provider value={{
      activeCaseName, setActiveCaseName,
      docUploaded, setDocUploaded,
      docProcessed, setDocProcessed,
      hasReadyDocs, setHasReadyDocs,
    }}>
      {children}
    </ActiveCaseContext.Provider>
  );
}

export function useActiveCase(): ActiveCaseContextValue {
  return useContext(ActiveCaseContext);
}
