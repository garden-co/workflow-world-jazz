interface BaseUrlProps {
  children?: (url: string) => React.ReactNode;
}

export default function BaseUrl({ children }: BaseUrlProps = {}) {
  const baseUrl = process.env.VERCEL_URL ?? 'localhost:3000';
  const prefix = baseUrl !== 'localhost:3000' ? 'https://' : 'http://';
  const fullUrl = `${prefix}${baseUrl}`;

  // If children is a function, call it with the URL
  if (children && typeof children === 'function') {
    return <>{children(fullUrl)}</>;
  }
}
