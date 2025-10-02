import type { MDXComponents } from 'mdx/types';
import Link from 'next/link';
import BaseUrl from '@/components/base-url';
import * as CalloutComponents from '@/components/ui/callout';
import * as CardComponents from '@/components/ui/card';
import { CodeBlock } from '@/components/ui/code-block';
import * as TabsComponents from '@/components/ui/tabs';
import { TypeTable } from '@/components/ui/type-table';
import { TSDoc } from '@/lib/tsdoc';
import { cn } from './lib/cn';

// use this function to get MDX components, you will need it for rendering MDX
export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    BaseUrl,
    TypeTable,
    TSDoc,
    CodeBlock,
    ...TabsComponents,
    ...CardComponents,
    ...CalloutComponents,
    li: ({ ref: _ref, ...props }) => (
      <li {...props} className="prose">
        {props.children}
      </li>
    ),
    p: ({ ref: _ref, ...props }) => (
      <p
        {...props}
        className={`text-muted-foreground ${props.className || ''}`}
      >
        {props.children}
      </p>
    ),
    pre: CodeBlock,
    ...components,
    ...(components?.a && {
      a: ({ className, ...props }) => {
        const isExternal = props.href.startsWith('http');

        return (
          <Link
            {...props}
            className={cn(
              'no-underline text-primary-foreground font-normal',
              className
            )}
          >
            {props.children}
            {isExternal && (
              <svg
                className="size-3 inline-block align-middle ml-1"
                data-testid="geist-icon"
                height="16"
                strokeLinejoin="round"
                viewBox="0 0 16 16"
                width="16"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  clip-rule="evenodd"
                  d="M13.5 10.25V13.25C13.5 13.3881 13.3881 13.5 13.25 13.5H2.75C2.61193 13.5 2.5 13.3881 2.5 13.25L2.5 2.75C2.5 2.61193 2.61193 2.5 2.75 2.5H5.75H6.5V1H5.75H2.75C1.7835 1 1 1.7835 1 2.75V13.25C1 14.2165 1.7835 15 2.75 15H13.25C14.2165 15 15 14.2165 15 13.25V10.25V9.5H13.5V10.25ZM9 1H9.75H14.2495C14.6637 1 14.9995 1.33579 14.9995 1.75V6.25V7H13.4995V6.25V3.56066L8.53033 8.52978L8 9.06011L6.93934 7.99945L7.46967 7.46912L12.4388 2.5H9.75H9V1Z"
                  fill="currentColor"
                ></path>
              </svg>
            )}
          </Link>
        );
      },
    }),
  };
}
