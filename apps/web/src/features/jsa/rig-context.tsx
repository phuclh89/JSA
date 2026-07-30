import { useQuery } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import type { OrganizationOption } from '@jsams/shared-types';
import { useAuth } from '../auth/auth-context';
import { jsaApi } from './jsa-api';

interface RigContextValue {
  rigs: OrganizationOption[];
  selectedRigId?: string;
  selectedRig?: OrganizationOption;
  loading: boolean;
  setSelectedRigId(rigId?: string): void;
}

const RigContext = createContext<RigContextValue | undefined>(undefined);

export function RigProvider({ children }: PropsWithChildren) {
  const { status, user } = useAuth();
  const [selectedRigId, setSelectedRigIdState] = useState<string>();
  const initializedUserId = useRef<string>();
  const rigs = useQuery({
    queryKey: ['jsa-global-rigs', user?.userId],
    queryFn: () => jsaApi.options<OrganizationOption>('rigs'),
    enabled: status === 'authenticated' && Boolean(user),
  });

  useEffect(() => {
    if (!user || !rigs.data || initializedUserId.current === user.userId) return;
    const stored = readSelection(user.userId);
    const storedRig = stored ? rigs.data.find((rig) => rig.id === stored) : undefined;
    const defaultRig = user.defaultRigId
      ? rigs.data.find((rig) => rig.id === user.defaultRigId)
      : undefined;
    const initialRig =
      stored === 'ALL' ? undefined : (storedRig ?? defaultRig ?? single(rigs.data));
    setSelectedRigIdState(initialRig?.id);
    initializedUserId.current = user.userId;
  }, [rigs.data, user]);

  useEffect(() => {
    if (!user) {
      initializedUserId.current = undefined;
      setSelectedRigIdState(undefined);
    }
  }, [user]);

  const setSelectedRigId = useCallback(
    (rigId?: string) => {
      const validRigId = rigId && rigs.data?.some((rig) => rig.id === rigId) ? rigId : undefined;
      setSelectedRigIdState(validRigId);
      if (user) writeSelection(user.userId, validRigId);
    },
    [rigs.data, user],
  );
  const selectedRig = rigs.data?.find((rig) => rig.id === selectedRigId);
  const value = useMemo<RigContextValue>(
    () => ({
      rigs: rigs.data ?? [],
      selectedRigId,
      selectedRig,
      loading: rigs.isLoading,
      setSelectedRigId,
    }),
    [rigs.data, rigs.isLoading, selectedRig, selectedRigId, setSelectedRigId],
  );

  return <RigContext.Provider value={value}>{children}</RigContext.Provider>;
}

export function useRigContext() {
  const value = useContext(RigContext);
  if (!value) throw new Error('useRigContext must be used within RigProvider');
  return value;
}

function storageKey(userId: string) {
  return `jsams:working-rig:${userId}`;
}

function readSelection(userId: string) {
  try {
    return localStorage.getItem(storageKey(userId)) ?? undefined;
  } catch {
    return undefined;
  }
}

function writeSelection(userId: string, rigId?: string) {
  try {
    localStorage.setItem(storageKey(userId), rigId ?? 'ALL');
  } catch {
    // Storage can be unavailable in hardened browser modes; in-memory selection still works.
  }
}

function single(rigs: OrganizationOption[]) {
  return rigs.length === 1 ? rigs[0] : undefined;
}
