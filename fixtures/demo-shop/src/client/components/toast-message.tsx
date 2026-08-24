import type { FC } from 'react';

interface ToastMessageProps {
  readonly message: string;
}

export const ToastMessage: FC<ToastMessageProps> = ({ message }) => (
  <aside className="toast-message" data-cy="toast-message" role="status">
    {message}
  </aside>
);
