import {
  createContext,
  type PropsWithChildren,
  useContext,
  useMemo,
  useState,
} from 'react';

interface PrototypeContextValue {
  completedSets: Record<string, number[]>;
  toggleSet: (exerciseId: string, setIndex: number) => void;
  resetWorkout: () => void;
}

const PrototypeContext = createContext<PrototypeContextValue | null>(null);

export function PrototypeProvider({ children }: PropsWithChildren) {
  const [completedSets, setCompletedSets] = useState<Record<string, number[]>>(
    {},
  );

  const value = useMemo<PrototypeContextValue>(
    () => ({
      completedSets,
      toggleSet(exerciseId, setIndex) {
        setCompletedSets((current) => {
          const sets = current[exerciseId] ?? [];
          return {
            ...current,
            [exerciseId]: sets.includes(setIndex)
              ? sets.filter((value) => value !== setIndex)
              : [...sets, setIndex],
          };
        });
      },
      resetWorkout() {
        setCompletedSets({});
      },
    }),
    [completedSets],
  );

  return (
    <PrototypeContext.Provider value={value}>
      {children}
    </PrototypeContext.Provider>
  );
}

export function usePrototype() {
  const context = useContext(PrototypeContext);
  if (!context)
    throw new Error('usePrototype must be used within PrototypeProvider');
  return context;
}
