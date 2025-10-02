import Link from 'next/link';
import type { ReactNode } from 'react';

interface CardProps {
  children?: ReactNode;
  href?: string;
  title?: string;
  description?: string;
  icon?: ReactNode;
  className?: string;
}

interface CardsProps {
  children: ReactNode;
  className?: string;
}

export function Card({
  children,
  href,
  title,
  description,
  icon,
  className,
}: CardProps) {
  const cardContent = (
    <>
      {icon && (
        <div className="mb-2 text-foreground [&_svg]:fill-current">{icon}</div>
      )}
      {title && <h3 className="font-semibold mb-1">{title}</h3>}
      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}
      {children}
    </>
  );

  const cardClassName = `hover:opacity-100 no-underline block p-4 border hover:bg-secondary/50 rounded-lg transition ease-out [&_h3]:m-0 [&_h3]:!text-base [&_h3]:!font-medium [&_p]:font-normal [&_p]:text-sm [&_p]:mt-2 [&_p]:text-muted-foreground [&_p]:m-0 ${className || ''}`;

  if (href) {
    return (
      <Link href={href} className={cardClassName}>
        {cardContent}
      </Link>
    );
  }

  return <div className={cardClassName}>{cardContent}</div>;
}

export function Cards({ children, className }: CardsProps) {
  return (
    <div className={`grid gap-4 md:grid-cols-2 ${className || ''}`}>
      {children}
    </div>
  );
}
