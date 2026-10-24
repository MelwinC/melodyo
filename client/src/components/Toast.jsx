import { useSyncExternalStore } from 'react';
import { getToast, subscribeToast } from '../lib/toast.js';

export default function Toast() {
  const { msg, visible } = useSyncExternalStore(subscribeToast, getToast);
  return <div className={`toast${visible ? ' show' : ''}`}>{msg}</div>;
}
