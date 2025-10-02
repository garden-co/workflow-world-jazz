'use client';
import { useBreadcrumb } from 'fumadocs-core/breadcrumb';
import { Link } from 'fumadocs-core/framework';
import type {
  PageTree,
  TableOfContents,
  TOCItemType,
} from 'fumadocs-core/server';
import { AnchorProvider, useActiveAnchors } from 'fumadocs-core/toc';
import { useTreeContext } from 'fumadocs-ui/contexts/tree';
import { usePathname } from 'next/navigation';
import { type ComponentProps, Fragment, type ReactNode, useMemo } from 'react';
import { cn } from '../../lib/cn';
import { CopyPageAsMarkdown } from '../copy-page-markdown';

export interface DocsPageProps {
  toc?: TableOfContents;

  children: ReactNode;
}

export function DocsPage({ toc = [], ...props }: DocsPageProps) {
  const { root } = useTreeContext();
  const pathname = usePathname();
  const breadcrumbItems = useBreadcrumb(pathname, root);

  const isIntroduction = pathname.split('/').includes('introduction');

  return (
    <AnchorProvider toc={toc}>
      <main className="flex w-full min-w-0 flex-col pt-12">
        <div className="flex flex-row justify-between items-center pr-4">
          {breadcrumbItems.length > 0 && !isIntroduction ? (
            <div className="w-full max-w-[860px] px-4 md:px-6 md:mx-auto">
              <div className="flex flex-row items-center gap-1 text-sm text-muted-foreground">
                {breadcrumbItems.map((item, i) => (
                  <Fragment key={i}>
                    {i !== 0 && (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="opacity-50"
                      >
                        <path d="m9 18 6-6-6-6" />
                      </svg>
                    )}
                    {item.url ? (
                      <Link
                        href={item.url}
                        className="hover:text-foreground transition-colors"
                      >
                        {item.name}
                      </Link>
                    ) : (
                      <span className="text-foreground">{item.name}</span>
                    )}
                  </Fragment>
                ))}
              </div>
            </div>
          ) : (
            <div className="w-full max-w-[860px] px-4 md:px-6 md:mx-auto text-sm text-muted-foreground">
              <Link
                href="/docs/introduction"
                className="hover:text-foreground transition-colors"
              >
                Introduction
              </Link>
            </div>
          )}
          <CopyPageAsMarkdown />
        </div>
        <article className="flex flex-1 flex-col w-full max-w-[860px] gap-6 px-4 pb-8 pt-4 md:px-6 md:mx-auto">
          {props.children}
          <Footer />
        </article>
      </main>
      {toc.length > 0 && (
        <div className="sticky top-(--fd-nav-height) w-[286px] shrink-0 h-[calc(100dvh-var(--fd-nav-height))] pt-14 px-4 overflow-auto max-xl:hidden">
          <p className="text-sm text-fd-foreground mb-2">On this page</p>
          <div className="flex flex-col">
            {toc.map((item) => (
              <TocItem key={item.url} item={item} />
            ))}
          </div>
        </div>
      )}
    </AnchorProvider>
  );
}

export function DocsBody(props: ComponentProps<'div'>) {
  return (
    <div {...props} className={cn('prose', props.className)}>
      {props.children}
    </div>
  );
}

export function DocsDescription(props: ComponentProps<'p'>) {
  // don't render if no description provided
  if (props.children === undefined) return null;

  return (
    <p
      {...props}
      className={cn('mb-8 text-lg text-fd-muted-foreground', props.className)}
    >
      {props.children}
    </p>
  );
}

export function DocsTitle(props: ComponentProps<'h1'>) {
  return (
    <h1 {...props} className={cn('text-3xl font-semibold', props.className)}>
      {props.children}
    </h1>
  );
}

function TocItem({ item }: { item: TOCItemType }) {
  const isActive = useActiveAnchors().includes(item.url.slice(1));

  return (
    <a
      href={item.url}
      className={cn(
        'text-sm text-muted-foreground py-1 hover:text-fd-foreground transition-colors ease-out',
        isActive && 'text-primary-foreground opacity-100'
      )}
      style={{
        paddingLeft: Math.max(0, item.depth - 2) * 16,
      }}
    >
      {item.title}
    </a>
  );
}

function Footer() {
  const { root } = useTreeContext();
  const pathname = usePathname();
  const flatten = useMemo(() => {
    const result: PageTree.Item[] = [];

    function scan(items: PageTree.Node[]) {
      for (const item of items) {
        if (item.type === 'page') result.push(item);
        else if (item.type === 'folder') {
          if (item.index) result.push(item.index);
          scan(item.children);
        }
      }
    }

    scan(root.children);
    return result;
  }, [root]);

  const { previous, next } = useMemo(() => {
    const idx = flatten.findIndex((item) => item.url === pathname);

    if (idx === -1) return {};
    return {
      previous: flatten[idx - 1],
      next: flatten[idx + 1],
    };
  }, [flatten, pathname]);

  return (
    <div className="flex flex-row justify-between gap-8 mt-16 pt-8 border-t">
      {previous ? (
        <Link
          href={previous.url}
          className="group flex items-start gap-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 16 16"
            strokeLinejoin="round"
            className="mt-[24px]"
            style={{ color: 'currentcolor' }}
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M10.5 14.0607L9.96967 13.5303L5.14645 8.70712C4.75592 8.31659 4.75592 7.68343 5.14645 7.2929L9.96967 2.46968L10.5 1.93935L11.5607 3.00001L11.0303 3.53034L6.56066 8.00001L11.0303 12.4697L11.5607 13L10.5 14.0607Z"
              fill="currentColor"
            />
          </svg>
          <div className="flex flex-col">
            <span className="text-xs">Previous</span>
            <span>{previous.name}</span>
          </div>
        </Link>
      ) : (
        <div />
      )}
      {next ? (
        <Link
          href={next.url}
          className="group flex items-start gap-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <div className="flex flex-col items-end">
            <span className="text-xs">Next</span>
            <span>{next.name}</span>
          </div>
          <svg
            width="12"
            height="12"
            viewBox="0 0 16 16"
            strokeLinejoin="round"
            className="mt-[24px]"
            style={{ color: 'currentcolor' }}
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M5.50001 1.93933L6.03034 2.46966L10.8536 7.29288C11.2441 7.68341 11.2441 8.31657 10.8536 8.7071L6.03034 13.5303L5.50001 14.0607L4.43935 13L4.96968 12.4697L9.43935 7.99999L4.96968 3.53032L4.43935 2.99999L5.50001 1.93933Z"
              fill="currentColor"
            />
          </svg>
        </Link>
      ) : (
        <div />
      )}
    </div>
  );
}
