const { publish, defineConfig } = require('test-results-reporter');
require('dotenv').config();

const teamsHookBaseURL = process.env.TEAMS_HOOK_INDEXER;

const config = defineConfig({
  reports: [
    {
      targets: [
        {
          name: 'teams',
          condition: 'fail',
          inputs: {
            url: teamsHookBaseURL,
            only_failures: true,
            publish: 'test-summary-slim',
            title: 'Indexer Chain Tests Report',
            width: 'Full',
          },
          extensions: [
            {
              name: 'quick-chart-test-summary',
            },
            {
              name: 'hyperlinks',
              inputs: {
                links: [
                  {
                    text: 'HTML Report',
                    url: 'https://titan.dplcenter.xyz/view/Tests/job/Indexer_Chain_Tests/Indexer_20Chain_20Tests/*zip*/Indexer_20Chain_20Tests.zip',
                  },
                ],
              },
            },
          ],
        },
      ],
      results: [
        {
          type: 'mocha',
          files: ['./mochawesome-report/indexer_chain.json'],
        },
      ],
    },
  ],
});

publish({ config });
