'use client';

import React from 'react';

type SectionErrorBoundaryProps = {
  title?: string;
  children: React.ReactNode;
};

type SectionErrorBoundaryState = {
  hasError: boolean;
};

export default class SectionErrorBoundary extends React.Component<SectionErrorBoundaryProps, SectionErrorBoundaryState> {
  constructor(props: SectionErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('SectionErrorBoundary caught an error', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-100">
          {this.props.title ? `${this.props.title} kunde inte visas just nu.` : 'Den här sektionen kunde inte visas just nu.'}
        </div>
      );
    }

    return this.props.children;
  }
}
