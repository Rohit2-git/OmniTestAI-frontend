import type { Application, TestCase, ExecutionRun, KnowledgeAsset } from '../types';

export const initialApplications: Application[] = [
  {
    id: 'app-swiftcart',
    name: 'SwiftCart E-Commerce',
    description: 'A consumer-facing retail storefront featuring shopping cart, filters, promo codes, and guest checkout flows.',
    platform: 'web',
    url: 'https://swiftcart-shop.example.com',
    createdAt: '2026-04-10T10:00:00Z',
    status: 'active'
  },
  {
    id: 'app-apexbank',
    name: 'Apex Mobile Banking',
    description: 'Secure customer mobile banking portal containing fund transfers, biometric login, and transaction history statements.',
    platform: 'mobile',
    url: 'https://apex-bank.example.com',
    createdAt: '2026-04-15T14:30:00Z',
    status: 'active'
  },
  {
    id: 'app-zetacrm',
    name: 'Zeta CRM Portal',
    description: 'Enterprise relationship management system for tracking leads, pipeline sales, customer contacts, and calendar schedules.',
    platform: 'web',
    url: 'https://zeta-crm.example.com',
    createdAt: '2026-05-01T09:00:00Z',
    status: 'active'
  }
];

export const initialTestCases: TestCase[] = [
  // SwiftCart Test Cases
  {
    id: 'tc-sc-login',
    appId: 'app-swiftcart',
    title: 'Successful Customer Login',
    description: 'Verify that an existing customer can sign in successfully using correct email and password credentials.',
    priority: 'high',
    source: 'manual',
    section: 'Authentication',
    createdAt: '2026-04-11T11:00:00Z',
    steps: [
      { id: 'sc-l1', instruction: 'Navigate to login page', expected: 'URL displays /login' },
      { id: 'sc-l2', instruction: 'Enter "user@example.com" in Email input', expected: 'Email field contains typed text' },
      { id: 'sc-l3', instruction: 'Enter "securepassword123" in Password input', expected: 'Password characters are masked' },
      { id: 'sc-l4', instruction: 'Click the "Sign In" button', expected: 'Redirects to dashboard and displays "Welcome back, User!"' }
    ]
  },
  {
    id: 'tc-sc-invalid-login',
    appId: 'app-swiftcart',
    title: 'Login with Invalid Password',
    description: 'Verify that appropriate error messages are displayed when entering an invalid password.',
    priority: 'medium',
    source: 'manual',
    section: 'Authentication',
    createdAt: '2026-04-11T11:15:00Z',
    steps: [
      { id: 'sc-il1', instruction: 'Navigate to login page', expected: 'URL displays /login' },
      { id: 'sc-il2', instruction: 'Enter "user@example.com" in Email input', expected: 'Email field contains typed text' },
      { id: 'sc-il3', instruction: 'Enter "wrongpass" in Password input', expected: 'Password characters are masked' },
      { id: 'sc-il4', instruction: 'Click the "Sign In" button', expected: 'Error banner displays: "Invalid email or password. Please try again."' }
    ]
  },
  {
    id: 'tc-sc-add-to-cart',
    appId: 'app-swiftcart',
    title: 'Add Item to Shopping Cart',
    description: 'Verify that items can be searched, selected, and added to the cart, updating the header badge.',
    priority: 'high',
    source: 'manual',
    section: 'Shopping Cart',
    createdAt: '2026-04-12T09:30:00Z',
    steps: [
      { id: 'sc-ac1', instruction: 'Search for "Sneakers" in search bar', expected: 'Search results show matching items' },
      { id: 'sc-ac2', instruction: 'Click on "Retro Runner Sneakers" product card', expected: 'Navigates to product detail page' },
      { id: 'sc-ac3', instruction: 'Select size "10" and click "Add to Cart"', expected: 'Cart badge count increments to 1' }
    ]
  },
  {
    id: 'tc-sc-checkout-flow',
    appId: 'app-swiftcart',
    title: 'Complete Checkout with Credit Card',
    description: 'Verify guest checkout flow starting from cart summary to successful payment confirmation.',
    priority: 'high',
    source: 'manual',
    section: 'Checkout',
    createdAt: '2026-04-12T10:00:00Z',
    steps: [
      { id: 'sc-ch1', instruction: 'Navigate to cart page and click "Proceed to Checkout"', expected: 'Navigates to checkout page' },
      { id: 'sc-ch2', instruction: 'Fill shipping address details', expected: 'Address form inputs are filled and validated' },
      { id: 'sc-ch3', instruction: 'Enter test credit card details and click "Pay Now"', expected: 'Spinner shows, then redirects to order success page showing order confirmation number' }
    ]
  },
  {
    id: 'tc-sc-promo-code',
    appId: 'app-swiftcart',
    title: 'Apply Valid Promo Code',
    description: 'Verify that applying a 15% promo code modifies the total checkout price correctly.',
    priority: 'medium',
    source: 'manual',
    section: 'Checkout',
    createdAt: '2026-04-13T16:00:00Z',
    steps: [
      { id: 'sc-pc1', instruction: 'Navigate to checkout checkout-summary page', expected: 'Summary shows original total price' },
      { id: 'sc-pc2', instruction: 'Enter "SAVE15" in Promo Code input and click "Apply"', expected: 'Success text: "SAVE15 applied: 15% discount". Total price updates.' }
    ]
  },

  // Apex Banking Test Cases
  {
    id: 'tc-ab-fingerprint',
    appId: 'app-apexbank',
    title: 'Biometric TouchID Unlock',
    description: 'Verify user can unlock their mobile banking interface using biometric simulated credentials.',
    priority: 'high',
    source: 'manual',
    section: 'Authentication',
    createdAt: '2026-04-16T08:00:00Z',
    steps: [
      { id: 'ab-b1', instruction: 'Launch app and tap "Fingerprint Login"', expected: 'System prompt dialog displays' },
      { id: 'ab-b2', instruction: 'Simulate successful biometric scan', expected: 'Dialog closes, app unlocks to home dashboard showing account balance' }
    ]
  },
  {
    id: 'tc-ab-transfer',
    appId: 'app-apexbank',
    title: 'Transfer Funds to External Account',
    description: 'Verify routing and transaction codes for instant transfers to registered beneficiaries.',
    priority: 'high',
    source: 'manual',
    section: 'Transfers',
    createdAt: '2026-04-17T11:20:00Z',
    steps: [
      { id: 'ab-t1', instruction: 'Navigate to "Transfer Money" -> "External Transfer"', expected: 'External transfer form displays' },
      { id: 'ab-t2', instruction: 'Select beneficiary "Jane Doe", enter amount "$250.00"', expected: 'Details fill correctly, Transfer button activates' },
      { id: 'ab-t3', instruction: 'Tap "Confirm Transfer" and complete SMS verification', expected: 'Receipt displays: "Transfer successful! Reference #TRX-9082"' }
    ]
  },

  // Zeta CRM Test Cases
  {
    id: 'tc-zc-add-lead',
    appId: 'app-zetacrm',
    title: 'Add New Sales Lead',
    description: 'Verify creating a contact, assigning value, and placing them in the pipeline stages.',
    priority: 'medium',
    source: 'manual',
    section: 'Leads & Pipeline',
    createdAt: '2026-05-02T10:00:00Z',
    steps: [
      { id: 'zc-l1', instruction: 'Navigate to "Pipeline" tab and click "Add Lead"', expected: 'Add Lead popup form displays' },
      { id: 'zc-l2', instruction: 'Enter Company "SolarTech", Lead Name "Robert Chen", Value "$15,000"', expected: 'Values fill in form inputs' },
      { id: 'zc-l3', instruction: 'Select status "Proposal Sent" and click "Save"', expected: 'SolarTech card appears under "Proposal" column on Kanban board' }
    ]
  }
];

export const initialKnowledgeAssets: KnowledgeAsset[] = [
  {
    id: 'kb-swiftcart-ac',
    appId: 'app-swiftcart',
    name: 'Checkout Acceptance Criteria v2',
    type: 'doc',
    summary: 'Business acceptance criteria for cart, checkout, and promo calculation rules.',
    tags: ['checkout', 'acceptance', 'discount'],
    createdAt: '2026-05-06T10:00:00Z'
  },
  {
    id: 'kb-swiftcart-jira',
    appId: 'app-swiftcart',
    name: 'Jira Epic QA-294',
    type: 'link',
    summary: 'Epic and linked user stories for guest checkout revamp.',
    url: 'https://jira.example.com/browse/QA-294',
    tags: ['jira', 'epic', 'guest-checkout'],
    createdAt: '2026-05-08T08:30:00Z'
  },
  {
    id: 'kb-apex-risk',
    appId: 'app-apexbank',
    name: 'Threat Model Screenshot',
    type: 'image',
    summary: 'Security hotspots for biometric login and transfer approvals.',
    tags: ['security', 'biometric', 'transfer'],
    createdAt: '2026-05-12T12:45:00Z'
  }
];

export const initialExecutionHistory: ExecutionRun[] = [
  {
    id: 'run-001',
    appId: 'app-swiftcart',
    testCaseIds: ['tc-sc-login', 'tc-sc-add-to-cart'],
    status: 'passed',
    executedAt: '2026-05-20T09:15:00Z',
    metrics: {
      durationMs: 4200,
      stepsCount: 7,
      passedCount: 7
    },
    logs: [
      { timestamp: '09:15:00', type: 'info', message: 'Starting execution suite for SwiftCart E-Commerce (2 test cases)' },
      { timestamp: '09:15:01', type: 'step', message: 'Test Case: Successful Customer Login' },
      { timestamp: '09:15:01', type: 'info', message: 'Navigating to https://swiftcart-shop.example.com/login' },
      { timestamp: '09:15:02', type: 'info', message: 'Entering "user@example.com" in Email input' },
      { timestamp: '09:15:02', type: 'info', message: 'Entering "securepassword123" in Password input' },
      { timestamp: '09:15:03', type: 'success', message: 'Assertion Passed: Redirected to dashboard' },
      { timestamp: '09:15:03', type: 'step', message: 'Test Case: Add Item to Shopping Cart' },
      { timestamp: '09:15:03', type: 'info', message: 'Searching for "Sneakers" in search bar' },
      { timestamp: '09:15:04', type: 'info', message: 'Clicking Retro Runner Sneakers product card' },
      { timestamp: '09:15:04', type: 'info', message: 'Selecting size 10 and clicking Add to Cart' },
      { timestamp: '09:15:04', type: 'success', message: 'Assertion Passed: Cart badge count is 1' },
      { timestamp: '09:15:04', type: 'success', message: 'Suite completed successfully! 2/2 test cases passed.' }
    ]
  },
  {
    id: 'run-002',
    appId: 'app-swiftcart',
    testCaseIds: ['tc-sc-invalid-login'],
    status: 'passed',
    executedAt: '2026-05-20T14:45:00Z',
    metrics: {
      durationMs: 2500,
      stepsCount: 4,
      passedCount: 4
    },
    logs: [
      { timestamp: '14:45:00', type: 'info', message: 'Starting execution for: Login with Invalid Password' },
      { timestamp: '14:45:01', type: 'info', message: 'Navigating to https://swiftcart-shop.example.com/login' },
      { timestamp: '14:45:01', type: 'info', message: 'Entering "user@example.com" in Email input' },
      { timestamp: '14:45:02', type: 'info', message: 'Entering "wrongpass" in Password input' },
      { timestamp: '14:45:02', type: 'info', message: 'Clicking Sign In button' },
      { timestamp: '14:45:02', type: 'success', message: 'Assertion Passed: Error banner "Invalid email or password. Please try again." is visible' },
      { timestamp: '14:45:02', type: 'success', message: 'Execution completed successfully. 1/1 test cases passed.' }
    ]
  },
  {
    id: 'run-003',
    appId: 'app-swiftcart',
    testCaseIds: ['tc-sc-promo-code'],
    status: 'failed',
    executedAt: '2026-05-19T10:30:00Z',
    nlInstruction: 'Apply promo code SAVE15 and verify it deducts 15% discount.',
    metrics: {
      durationMs: 3800,
      stepsCount: 2,
      passedCount: 1
    },
    logs: [
      { timestamp: '10:30:00', type: 'info', message: 'Starting execution run via Natural Language input' },
      { timestamp: '10:30:00', type: 'info', message: 'Instruction: "Apply promo code SAVE15 and verify it deducts 15% discount."' },
      { timestamp: '10:30:01', type: 'step', message: 'Step 1: Navigate to checkout page' },
      { timestamp: '10:30:02', type: 'success', message: 'Current page confirmed: https://swiftcart-shop.example.com/checkout' },
      { timestamp: '10:30:02', type: 'step', message: 'Step 2: Apply promo code SAVE15 and check discount' },
      { timestamp: '10:30:03', type: 'info', message: 'Entering "SAVE15" into promo code field' },
      { timestamp: '10:30:03', type: 'info', message: 'Clicking Apply button' },
      { timestamp: '10:30:03', type: 'warning', message: 'Server responded with 500 Internal Server Error during discount verification.' },
      { timestamp: '10:30:03', type: 'error', message: 'Assertion Failed: Total price did not update. Expected: $85.00, Found: $100.00' },
      { timestamp: '10:30:03', type: 'error', message: 'Execution failed: 0/1 test cases passed. Screenshot captured at failure point.' }
    ],
    screenshots: [
      {
        stepIndex: 1,
        viewName: 'Checkout Page - Coupon Error',
        imageType: 'error',
        highlightSelector: '.promo-code-input',
        highlightText: 'SAVE15'
      }
    ]
  },
  {
    id: 'run-004',
    appId: 'app-apexbank',
    testCaseIds: ['tc-ab-fingerprint', 'tc-ab-transfer'],
    status: 'passed',
    executedAt: '2026-05-18T16:20:00Z',
    metrics: {
      durationMs: 5100,
      stepsCount: 5,
      passedCount: 5
    },
    logs: [
      { timestamp: '16:20:00', type: 'info', message: 'Starting mobile test suite on Apex Mobile Banking (2 test cases)' },
      { timestamp: '16:20:01', type: 'step', message: 'Test Case: Biometric TouchID Unlock' },
      { timestamp: '16:20:02', type: 'info', message: 'Opening system biometric prompt dialog' },
      { timestamp: '16:20:03', type: 'success', message: 'TouchID unlock verified. Home page visible.' },
      { timestamp: '16:20:03', type: 'step', message: 'Test Case: Transfer Funds to External Account' },
      { timestamp: '16:20:04', type: 'info', message: 'Navigating to Transfers -> External Account' },
      { timestamp: '16:20:04', type: 'info', message: 'Selecting contact Jane Doe and entering amount $250.00' },
      { timestamp: '16:20:05', type: 'info', message: 'Submitting OTP SMS validation' },
      { timestamp: '16:20:05', type: 'success', message: 'Transaction statement verified. Code TRX-9082.' },
      { timestamp: '16:20:05', type: 'success', message: 'Suite passed. 2/2 test cases passed.' }
    ]
  }
];
