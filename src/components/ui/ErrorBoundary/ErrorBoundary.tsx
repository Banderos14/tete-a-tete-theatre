import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children:  ReactNode;
  /** Что показать вместо упавшего поддерева. null — просто ничего. */
  fallback?: ReactNode;
  /** Метка для логов: какая часть приложения упала. */
  label?:    string;
}

interface State {
  hasError: boolean;
}

// Единственный способ поймать ошибку рендера в React — классовый компонент.
//
// Зачем: модалки (AuthModal / ProfileDrawer / BookingModal) грузятся через
// React.lazy. Если их чанк не скачался (устаревший хеш после деплоя, блокировщик,
// обрыв сети) или упал при выполнении, React без границы ошибок размонтирует
// ВЕСЬ корень — вместо модалки пропадает весь сайт, включая статический лендинг.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Без персональных данных — только техническая часть.
    console.error(
      `[ErrorBoundary${this.props.label ? `:${this.props.label}` : ''}]`,
      error.name,
      error.message,
      info.componentStack,
    );
  }

  render(): ReactNode {
    if (this.state.hasError) return this.props.fallback ?? null;
    return this.props.children;
  }
}
