FROM node:22-alpine

# Install pnpm
RUN npm install -g pnpm@10.15.1
ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# Install jazz-run
RUN pnpm add -g https://pkg.pr.new/garden-co/jazz/jazz-run@98ef5d75cc3085a70fbf47060937a4c67f116677

CMD ["jazz-run", "webhook", "run"]
