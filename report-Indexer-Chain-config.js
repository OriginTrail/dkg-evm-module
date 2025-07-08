const { publish, defineConfig } = require('test-results-reporter');
require('dotenv').config();

const teamsHookBaseURL = process.env.TEAMS_HOOK;

const config = defineConfig({
  reports: [
    {
      targets: [
        {
          name: 'teams',
          //condition: 'fail',
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
                    url: 'https://titan.dplcenter.xyz/view/Tests/job/dkg.js-Mainnet-Publish-Query-Get-Knowledge-Asset/Base_20Mainnet_20Report/*zip*/Base_20Mainnet_20Report.zip',
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
