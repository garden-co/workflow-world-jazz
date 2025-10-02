'use client';

import {
  CodeBlock as CodeBlockBase,
  Pre,
} from 'fumadocs-ui/components/codeblock';
import type { ComponentProps } from 'react';

export function CodeBlock(props: ComponentProps<'pre'>) {
  return (
    <CodeBlockBase
      {...props}
      className="relative bg-fd-background rounded-sm [.tab-content_&]:border-0 [.tab-content_&]:bg-transparent [.tab-content_&]:p-0 shadow-none !my-6"
    >
      <Pre className="[&_.highlighted]:!bg-primary-foreground/35 [&_.highlighted]:!border-primary-foreground [&_.highlighted::after]:!text-muted-foreground [.tab-content_&]:!m-0">
        {props.children}
      </Pre>
    </CodeBlockBase>
  );
}
