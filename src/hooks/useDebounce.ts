import { useState, useEffect } from 'react';

/**
 * useDebounce — delays updating a value until the user stops typing
 * 
 * Usage:
 *   const [searchTerm, setSearchTerm] = useState('');
 *   const debouncedSearch = useDebounce(searchTerm, 300);
 *   // debouncedSearch updates 300ms after the user stops typing
 *   // searchTerm updates immediately (so the input feels responsive)
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
