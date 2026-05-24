import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import type { LogEntry, ExecutionRun } from '../types';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Terminal as TerminalIcon, 
  Globe, 
  CheckCircle,
  Smartphone,
  Fingerprint
} from 'lucide-react';

interface ExecutorProps {
  selectedTestIdsForRun: string[];
  clearSelectedTests: () => void;
}

interface SimActionStep {
  log: string;
  logType: 'info' | 'step' | 'success' | 'warning' | 'error';
  browserState: string;
  highlightSelector?: string;
  highlightText?: string;
  value?: string;
  duration?: number;
}

export const Executor: React.FC<ExecutorProps> = ({ 
  selectedTestIdsForRun, 
  clearSelectedTests
}) => {
  const { applications, testCases, activeAppId, addExecutionRun } = useApp();
  const [nlCommand, setNlCommand] = useState('');
  
  // Simulation states
  const [isSimulating, setIsSimulating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [simSpeed, setSimSpeed] = useState<number>(1); // 1x, 2x, 4x
  const [currentStepIdx, setCurrentStepIdx] = useState<number>(-1);
  const [simLogs, setSimLogs] = useState<LogEntry[]>([]);
  const [simSteps, setSimSteps] = useState<SimActionStep[]>([]);
  
  // Simulated browser values
  const [simCartCount, setSimCartCount] = useState(0);
  const [simSearchTerm, setSimSearchTerm] = useState('');
  const [simPromoCode, setSimPromoCode] = useState('');
  const [simPromoApplied, setSimPromoApplied] = useState(false);
  const [simCheckoutTotal, setSimCheckoutTotal] = useState(100);
  const [simBiometricUnlocked, setSimBiometricUnlocked] = useState(false);
  const [simBiometricScanning, setSimBiometricScanning] = useState(false);
  const [simKanbanLeads, setSimKanbanLeads] = useState<{name: string, company: string, value: string, stage: string}[]>([
    { name: 'Alice Smith', company: 'Nexus Corp', value: '$8,000', stage: 'Lead In' },
    { name: 'David Lee', company: 'Quantum Tech', value: '$24,000', stage: 'Contacted' }
  ]);

  const activeApp = applications.find(app => app.id === activeAppId);
  const consoleEndRef = useRef<HTMLDivElement>(null);
  const simulationTimerRef = useRef<any | null>(null);

  // Auto-scroll logs
  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [simLogs]);

  // Load selected tests from repository
  useEffect(() => {
    if (selectedTestIdsForRun.length > 0) {
      const selectedTitles = selectedTestIdsForRun
        .map(id => testCases.find(tc => tc.id === id)?.title)
        .filter(Boolean)
        .join(', ');
      setNlCommand(`Execute suite: [${selectedTitles}]`);
    }
  }, [selectedTestIdsForRun, testCases]);

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      if (simulationTimerRef.current) clearInterval(simulationTimerRef.current);
    };
  }, []);

  const handleCancelSimulation = () => {
    if (simulationTimerRef.current) {
      clearInterval(simulationTimerRef.current);
      simulationTimerRef.current = null;
    }
    setIsSimulating(false);
    setIsPaused(false);
    setCurrentStepIdx(-1);
    setSimLogs([]);
    clearSelectedTests();
  };

  const resetBrowserState = () => {
    setSimCartCount(0);
    setSimSearchTerm('');
    setSimPromoCode('');
    setSimPromoApplied(false);
    setSimCheckoutTotal(100);
    setSimBiometricUnlocked(false);
    setSimBiometricScanning(false);
  };

  const getAppUrl = () => activeApp ? activeApp.url : 'http://localhost';

  // Build the state machine queue for execution
  const startSimulation = () => {
    if (!activeAppId) return;
    
    resetBrowserState();
    setIsSimulating(true);
    setIsPaused(false);
    setCurrentStepIdx(0);
    setSimLogs([]);
    
    const time = () => new Date().toTimeString().split(' ')[0];

    let stepsQueue: SimActionStep[] = [];

    // Case 1: Run based on selected repository tests
    if (selectedTestIdsForRun.length > 0) {
      stepsQueue.push({
        log: `Loading ${selectedTestIdsForRun.length} selected test cases from repository...`,
        logType: 'info',
        browserState: 'init'
      });

      selectedTestIdsForRun.forEach((tcId) => {
        const tc = testCases.find(item => item.id === tcId);
        if (!tc) return;

        stepsQueue.push({
          log: `Running test case: "${tc.title}"`,
          logType: 'step',
          browserState: 'init'
        });

        // E-commerce app steps
        if (activeAppId === 'app-swiftcart') {
          tc.steps.forEach((step) => {
            if (step.instruction.toLowerCase().includes('navigate') || step.instruction.toLowerCase().includes('login')) {
              stepsQueue.push({
                log: `Action: ${step.instruction}`,
                logType: 'info',
                browserState: 'login',
                highlightSelector: '.sim-form',
                highlightText: 'form.login-form'
              });
              stepsQueue.push({
                log: `Success: Credentials validated. ${step.expected}`,
                logType: 'success',
                browserState: 'catalog',
                highlightSelector: '.sim-hero-banner',
                highlightText: 'div.welcome-banner'
              });
            } else if (step.instruction.toLowerCase().includes('search')) {
              stepsQueue.push({
                log: `Action: ${step.instruction}`,
                logType: 'info',
                browserState: 'catalog',
                highlightSelector: '.sim-search-input',
                highlightText: 'input[type="search"]',
                value: 'Sneakers'
              });
              stepsQueue.push({
                log: `Success: Search finished. ${step.expected}`,
                logType: 'success',
                browserState: 'search_results',
                highlightSelector: '.sim-product-card',
                highlightText: 'div.product-card'
              });
            } else if (step.instruction.toLowerCase().includes('size') || step.instruction.toLowerCase().includes('add to cart')) {
              stepsQueue.push({
                log: `Action: ${step.instruction}`,
                logType: 'info',
                browserState: 'product_details',
                highlightSelector: '.sim-add-to-cart-btn',
                highlightText: 'button.add-to-cart'
              });
              stepsQueue.push({
                log: `Success: Badge count updated. ${step.expected}`,
                logType: 'success',
                browserState: 'product_details_added',
                highlightSelector: '.sim-cart-badge',
                highlightText: 'span.cart-count-badge'
              });
            } else if (step.instruction.toLowerCase().includes('checkout')) {
              stepsQueue.push({
                log: `Action: ${step.instruction}`,
                logType: 'info',
                browserState: 'checkout',
                highlightSelector: '.sim-checkout-btn',
                highlightText: 'button.checkout'
              });
              stepsQueue.push({
                log: `Success: Loaded checkout portal. ${step.expected}`,
                logType: 'success',
                browserState: 'checkout',
                highlightSelector: '.checkout-form',
                highlightText: 'form.checkout-form'
              });
            } else if (step.instruction.toLowerCase().includes('promo') || step.instruction.toLowerCase().includes('save')) {
              stepsQueue.push({
                log: `Action: ${step.instruction}`,
                logType: 'info',
                browserState: 'checkout_promo',
                highlightSelector: '.promo-input',
                highlightText: 'input[name="coupon"]',
                value: 'SAVE15'
              });
              stepsQueue.push({
                log: `Success: Discount validated. ${step.expected}`,
                logType: 'success',
                browserState: 'checkout_promo_applied',
                highlightSelector: '.price-summary',
                highlightText: 'div.price-summary'
              });
            } else if (step.instruction.toLowerCase().includes('pay') || step.instruction.toLowerCase().includes('credit card')) {
              stepsQueue.push({
                log: `Action: ${step.instruction}`,
                logType: 'info',
                browserState: 'checkout_promo_applied',
                highlightSelector: '.pay-btn',
                highlightText: 'button.submit-payment'
              });
              stepsQueue.push({
                log: `Success: Payment completed. ${step.expected}`,
                logType: 'success',
                browserState: 'order_success',
                highlightSelector: '.order-success-screen',
                highlightText: 'div.success-checkmark'
              });
            } else {
              // Generic fallback step
              stepsQueue.push({
                log: `Action: ${step.instruction}`,
                logType: 'info',
                browserState: 'catalog'
              });
              stepsQueue.push({
                log: `Success: Asserted. ${step.expected}`,
                logType: 'success',
                browserState: 'catalog'
              });
            }
          });
        } 
        // Mobile bank app steps
        else if (activeAppId === 'app-apexbank') {
          tc.steps.forEach(step => {
            if (step.instruction.toLowerCase().includes('fingerprint') || step.instruction.toLowerCase().includes('biometric')) {
              stepsQueue.push({
                log: `Action: ${step.instruction}`,
                logType: 'info',
                browserState: 'biometric_prompt',
                highlightSelector: '.biometric-icon-glow',
                highlightText: 'FingerprintSensor'
              });
              stepsQueue.push({
                log: `Success: Biometrics matched. ${step.expected}`,
                logType: 'success',
                browserState: 'dashboard',
                highlightSelector: '.banking-body',
                highlightText: 'div.accounts-dashboard'
              });
            } else if (step.instruction.toLowerCase().includes('transfer') || step.instruction.toLowerCase().includes('jane')) {
              stepsQueue.push({
                log: `Action: ${step.instruction}`,
                logType: 'info',
                browserState: 'transfer_form',
                highlightSelector: '.transfer-amount-input',
                highlightText: 'input[name="amount"]',
                value: '250.00'
              });
              stepsQueue.push({
                log: `Success: Details entered. Beneficiary selected. ${step.expected}`,
                logType: 'success',
                browserState: 'transfer_review',
                highlightSelector: '.confirm-btn',
                highlightText: 'button.confirm-transfer'
              });
              stepsQueue.push({
                log: `Action: Submitting transfer confirmation and completing OTP security...`,
                logType: 'info',
                browserState: 'transfer_processing'
              });
              stepsQueue.push({
                log: `Success: Transaction completed. ${step.expected}`,
                logType: 'success',
                browserState: 'transfer_receipt',
                highlightSelector: '.receipt-card',
                highlightText: 'div.receipt-details'
              });
            }
          });
        }
        // CRM Portal app steps
        else if (activeAppId === 'app-zetacrm') {
          tc.steps.forEach(step => {
            if (step.instruction.toLowerCase().includes('pipeline') || step.instruction.toLowerCase().includes('add lead')) {
              stepsQueue.push({
                log: `Action: ${step.instruction}`,
                logType: 'info',
                browserState: 'kanban',
                highlightSelector: '.add-lead-btn',
                highlightText: 'button.add-lead'
              });
              stepsQueue.push({
                log: `Success: Displayed modal form. ${step.expected}`,
                logType: 'success',
                browserState: 'add_lead_modal',
                highlightSelector: '.crm-lead-form',
                highlightText: 'form.lead-details'
              });
            } else if (step.instruction.toLowerCase().includes('robert') || step.instruction.toLowerCase().includes('solartech')) {
              stepsQueue.push({
                log: `Action: ${step.instruction}`,
                logType: 'info',
                browserState: 'add_lead_modal',
                highlightSelector: '.form-company-name',
                highlightText: 'input[name="company"]',
                value: 'SolarTech'
              });
              stepsQueue.push({
                log: `Success: Form values entered. ${step.expected}`,
                logType: 'success',
                browserState: 'add_lead_modal',
                highlightSelector: '.save-lead-btn',
                highlightText: 'button.save'
              });
              stepsQueue.push({
                log: `Action: Clicking Save Lead and placing on Kanban Board...`,
                logType: 'info',
                browserState: 'kanban_updating'
              });
              stepsQueue.push({
                log: `Success: Card displayed on Kanban Board. ${step.expected}`,
                logType: 'success',
                browserState: 'kanban_updated',
                highlightSelector: '.kanban-card-new',
                highlightText: 'div.kanban-card.solartech'
              });
            }
          });
        }
      });
    } 
    // Case 2: Natural Language input execution
    else {
      stepsQueue.push({
        log: `Parsing Natural Language command...`,
        logType: 'info',
        browserState: 'init'
      });
      stepsQueue.push({
        log: `Interpreting Instruction: "${nlCommand}"`,
        logType: 'info',
        browserState: 'init'
      });

      const cmd = nlCommand.toLowerCase();

      // If SwiftCart E-Commerce active
      if (activeAppId === 'app-swiftcart') {
        stepsQueue.push({
          log: `Action: Navigate to storefront landing page`,
          logType: 'info',
          browserState: 'login',
          highlightSelector: '.sim-logo',
          highlightText: 'header.nav-logo'
        });
        stepsQueue.push({
          log: `Success: Connection resolved. https://swiftcart-shop.example.com/login`,
          logType: 'success',
          browserState: 'login'
        });

        // Search action
        if (cmd.includes('search') || cmd.includes('sneaker') || cmd.includes('item') || cmd.includes('product')) {
          stepsQueue.push({
            log: `Action: Locating search field and typing "Sneakers"`,
            logType: 'info',
            browserState: 'catalog',
            highlightSelector: '.sim-search-input',
            highlightText: 'input[type="search"]',
            value: 'Sneakers'
          });
          stepsQueue.push({
            log: `Success: Rendered matching catalog list`,
            logType: 'success',
            browserState: 'search_results',
            highlightSelector: '.sim-product-card',
            highlightText: 'div.product-card'
          });
        }

        // Add to cart action
        if (cmd.includes('add') || cmd.includes('cart') || cmd.includes('buy')) {
          stepsQueue.push({
            log: `Action: Clicking "Retro Runner Sneakers" product details`,
            logType: 'info',
            browserState: 'product_details',
            highlightSelector: '.sim-product-card',
            highlightText: 'div.product-card'
          });
          stepsQueue.push({
            log: `Action: Selecting size 10 and clicking "Add to Cart"`,
            logType: 'info',
            browserState: 'product_details',
            highlightSelector: '.sim-add-to-cart-btn',
            highlightText: 'button.add-to-cart'
          });
          stepsQueue.push({
            log: `Success: Assertion Passed: Cart badge count incremented to 1`,
            logType: 'success',
            browserState: 'product_details_added',
            highlightSelector: '.sim-cart-badge',
            highlightText: 'span.cart-count-badge'
          });
        }

        // Promo / coupon action
        if (cmd.includes('promo') || cmd.includes('coupon') || cmd.includes('discount') || cmd.includes('save')) {
          stepsQueue.push({
            log: `Action: Navigating to Checkout portal`,
            logType: 'info',
            browserState: 'checkout',
            highlightSelector: '.sim-cart-badge',
            highlightText: 'span.cart'
          });
          stepsQueue.push({
            log: `Action: Entering coupon code "SAVE15" inside promo input`,
            logType: 'info',
            browserState: 'checkout_promo',
            highlightSelector: '.promo-input',
            highlightText: 'input[name="coupon"]',
            value: 'SAVE15'
          });
          
          if (cmd.includes('fail') || cmd.includes('error')) {
            // Simulated failure scenario if user specifically asks to test failures
            stepsQueue.push({
              log: `Warning: Server responded with status 500 during discount calculation.`,
              logType: 'warning',
              browserState: 'checkout_promo_error',
              highlightSelector: '.promo-error',
              highlightText: 'div.promo-error'
            });
            stepsQueue.push({
              log: `Error: Assertion Failed. Coupon validation did not modify checkout total. Expected: $85.00, Found: $100.00`,
              logType: 'error',
              browserState: 'checkout_promo_error',
              highlightSelector: '.price-summary',
              highlightText: 'div.price-summary'
            });
          } else {
            stepsQueue.push({
              log: `Success: Coupon code validated. Checkout total discounted by 15%`,
              logType: 'success',
              browserState: 'checkout_promo_applied',
              highlightSelector: '.price-summary',
              highlightText: 'div.price-summary'
            });
            stepsQueue.push({
              log: `Action: Filling credit card details and clicking Pay Now`,
              logType: 'info',
              browserState: 'checkout_promo_applied',
              highlightSelector: '.pay-btn',
              highlightText: 'button.pay'
            });
            stepsQueue.push({
              log: `Success: Order checkout completed successfully! Order SC-9041 created.`,
              logType: 'success',
              browserState: 'order_success',
              highlightSelector: '.order-success-screen',
              highlightText: 'div.success-checkmark'
            });
          }
        }
      } 
      // If Mobile Banking active
      else if (activeAppId === 'app-apexbank') {
        stepsQueue.push({
          log: `Action: Open Apex Mobile Banking client application`,
          logType: 'info',
          browserState: 'biometric_prompt',
          highlightSelector: '.phone-screen',
          highlightText: 'MobileClient'
        });

        if (cmd.includes('biometric') || cmd.includes('fingerprint') || cmd.includes('login') || cmd.includes('unlock')) {
          stepsQueue.push({
            log: `Action: Trigger system Fingerprint TouchID security dialog`,
            logType: 'info',
            browserState: 'biometric_prompt',
            highlightSelector: '.biometric-icon-glow',
            highlightText: 'FingerprintScanner'
          });
          stepsQueue.push({
            log: `Success: Biometric credentials authenticated successfully`,
            logType: 'success',
            browserState: 'dashboard',
            highlightSelector: '.banking-body',
            highlightText: 'div.dashboard'
          });
        }

        if (cmd.includes('transfer') || cmd.includes('send') || cmd.includes('pay') || cmd.includes('money')) {
          stepsQueue.push({
            log: `Action: Navigating to Transfer tab`,
            logType: 'info',
            browserState: 'dashboard',
            highlightSelector: '.transfer-nav-btn',
            highlightText: 'nav.transfer'
          });
          stepsQueue.push({
            log: `Action: Selecting beneficiary and entering amount $250.00`,
            logType: 'info',
            browserState: 'transfer_form',
            highlightSelector: '.transfer-amount-input',
            highlightText: 'input[name="amount"]',
            value: '250.00'
          });
          stepsQueue.push({
            log: `Action: Confirming transfer transaction details`,
            logType: 'info',
            browserState: 'transfer_review',
            highlightSelector: '.confirm-btn',
            highlightText: 'button.confirm'
          });
          stepsQueue.push({
            log: `Success: Fund transfer successful! Reference TRX-9082.`,
            logType: 'success',
            browserState: 'transfer_receipt',
            highlightSelector: '.receipt-card',
            highlightText: 'div.receipt'
          });
        }
      } 
      // If CRM portal active
      else if (activeAppId === 'app-zetacrm') {
        stepsQueue.push({
          log: `Action: Connect to CRM Kanban Pipeline board view`,
          logType: 'info',
          browserState: 'kanban',
          highlightSelector: '.kanban-board-sim',
          highlightText: 'div.kanban-board'
        });

        if (cmd.includes('lead') || cmd.includes('add') || cmd.includes('create') || cmd.includes('customer')) {
          stepsQueue.push({
            log: `Action: Clicking "Add Lead" trigger button`,
            logType: 'info',
            browserState: 'kanban',
            highlightSelector: '.add-lead-btn',
            highlightText: 'button.add-lead'
          });
          stepsQueue.push({
            log: `Success: Populated lead registration dialog form`,
            logType: 'success',
            browserState: 'add_lead_modal',
            highlightSelector: '.crm-lead-form',
            highlightText: 'form.lead'
          });
          stepsQueue.push({
            log: `Action: Inputting company details and assigning sales stage "Proposal Sent"`,
            logType: 'info',
            browserState: 'add_lead_modal',
            highlightSelector: '.form-company-name',
            highlightText: 'input[name="company"]',
            value: 'SolarTech'
          });
          stepsQueue.push({
            log: `Success: Saved lead SolarTech valued at $15,000`,
            logType: 'success',
            browserState: 'kanban_updated',
            highlightSelector: '.kanban-card-new',
            highlightText: 'div.kanban-card.solartech'
          });
        }
      }
      // If API suite active
      else {
        stepsQueue.push({
          log: `Action: Connecting to API Gateway test runner client...`,
          logType: 'info',
          browserState: 'init'
        });
        stepsQueue.push({
          log: `POST /api/v1/authenticate HTTP/1.1`,
          logType: 'step',
          browserState: 'init'
        });
        stepsQueue.push({
          log: `Response: Status 200 OK. Auth token generated.`,
          logType: 'success',
          browserState: 'init'
        });
        stepsQueue.push({
          log: `GET /api/v1/customers/profile HTTP/1.1`,
          logType: 'step',
          browserState: 'init'
        });
        stepsQueue.push({
          log: `Response: Status 200 OK. Asserted profile keys exist.`,
          logType: 'success',
          browserState: 'init'
        });
      }
    }

    setSimSteps(stepsQueue);

    // Setup interval to execute steps
    let idx = 0;
    const intervalTime = 1200;

    const runNextStep = () => {
      if (idx >= stepsQueue.length) {
        clearInterval(simulationTimerRef.current!);
        simulationTimerRef.current = null;
        
        // Wrap up execution run
        const isErrorInQueue = stepsQueue.some(s => s.logType === 'error');
        const finalStatus = isErrorInQueue ? 'failed' : 'passed';
        
        // Append final logs
        const finalLog: LogEntry = {
          timestamp: time(),
          type: finalStatus === 'passed' ? 'success' : 'error',
          message: finalStatus === 'passed' 
            ? 'Execution completed successfully. All validations passed.'
            : 'Execution failed. Visual assertion mismatch.'
        };
        
        setSimLogs(prev => [...prev, finalLog]);
        
        // Save to global context
        const passedCount = stepsQueue.filter(s => s.logType === 'success').length;
        const totalValidationCount = stepsQueue.filter(s => s.logType === 'success' || s.logType === 'error').length;
        
        const finishedRun: ExecutionRun = {
          id: `run-${Date.now()}`,
          appId: activeAppId,
          testCaseIds: selectedTestIdsForRun,
          status: finalStatus,
          nlInstruction: selectedTestIdsForRun.length > 0 ? undefined : nlCommand,
          executedAt: new Date().toISOString(),
          metrics: {
            durationMs: stepsQueue.length * intervalTime,
            stepsCount: totalValidationCount,
            passedCount: passedCount
          },
          logs: [...simLogs, finalLog] // approximate logs
        };

        // If it failed, add a screenshot reference
        if (finalStatus === 'failed') {
          finishedRun.screenshots = [
            {
              stepIndex: idx - 1,
              viewName: 'Failure Viewport Screenshot',
              imageType: 'error',
              highlightSelector: stepsQueue[idx-1]?.highlightSelector,
              highlightText: stepsQueue[idx-1]?.highlightText
            }
          ];
        }

        addExecutionRun(finishedRun);
        setIsSimulating(false);
        clearSelectedTests();
        return;
      }

      // Check if paused
      if (isPaused) return;

      const step = stepsQueue[idx];
      setCurrentStepIdx(idx);

      // Commit changes to simulated browser controls
      if (step.browserState === 'search_results' || step.value === 'Sneakers') {
        setSimSearchTerm('Sneakers');
      }
      if (step.browserState === 'product_details_added') {
        setSimCartCount(1);
      }
      if (step.browserState === 'checkout_promo_applied' || step.value === 'SAVE15') {
        setSimPromoCode('SAVE15');
        setSimPromoApplied(true);
        setSimCheckoutTotal(85);
      }
      if (step.browserState === 'biometric_prompt') {
        setSimBiometricScanning(true);
      }
      if (step.browserState === 'dashboard') {
        setSimBiometricScanning(false);
        setSimBiometricUnlocked(true);
      }
      if (step.browserState === 'kanban_updated' || step.value === 'SolarTech') {
        // Add new card
        setSimKanbanLeads(prev => {
          if (prev.some(l => l.company === 'SolarTech')) return prev;
          return [...prev, { name: 'Robert Chen', company: 'SolarTech', value: '$15,000', stage: 'Proposal' }];
        });
      }

      // Append log entry
      const logEntry: LogEntry = {
        timestamp: time(),
        type: step.logType,
        message: step.log
      };
      setSimLogs(prev => [...prev, logEntry]);
      
      idx++;
    };

    // Trigger first step immediately
    runNextStep();

    // Start ticker
    const ms = intervalTime / simSpeed;
    simulationTimerRef.current = setInterval(runNextStep, ms);
  };

  // React to pause change during execution
  useEffect(() => {
    if (isSimulating && simulationTimerRef.current) {
      clearInterval(simulationTimerRef.current);
      const intervalTime = 1200;
      const ms = intervalTime / simSpeed;

      let idx = currentStepIdx + 1;
      const runNextStep = () => {
        if (idx >= simSteps.length) {
          clearInterval(simulationTimerRef.current!);
          simulationTimerRef.current = null;
          
          const isErrorInQueue = simSteps.some(s => s.logType === 'error');
          const finalStatus = isErrorInQueue ? 'failed' : 'passed';
          
          const finalLog: LogEntry = {
            timestamp: new Date().toTimeString().split(' ')[0],
            type: finalStatus === 'passed' ? 'success' : 'error',
            message: finalStatus === 'passed' 
              ? 'Execution completed successfully. All validations passed.'
              : 'Execution failed. Visual assertion mismatch.'
          };
          setSimLogs(prev => [...prev, finalLog]);

          const passedCount = simSteps.filter(s => s.logType === 'success').length;
          const totalVal = simSteps.filter(s => s.logType === 'success' || s.logType === 'error').length;
          
          addExecutionRun({
            id: `run-${Date.now()}`,
            appId: activeAppId!,
            testCaseIds: selectedTestIdsForRun,
            status: finalStatus,
            nlInstruction: selectedTestIdsForRun.length > 0 ? undefined : nlCommand,
            executedAt: new Date().toISOString(),
            metrics: {
              durationMs: simSteps.length * intervalTime,
              stepsCount: totalVal,
              passedCount: passedCount
            },
            logs: [...simLogs, finalLog]
          });

          setIsSimulating(false);
          clearSelectedTests();
          return;
        }

        if (isPaused) return;

        const step = simSteps[idx];
        setCurrentStepIdx(idx);

        if (step.browserState === 'search_results' || step.value === 'Sneakers') setSimSearchTerm('Sneakers');
        if (step.browserState === 'product_details_added') setSimCartCount(1);
        if (step.browserState === 'checkout_promo_applied' || step.value === 'SAVE15') {
          setSimPromoCode('SAVE15');
          setSimPromoApplied(true);
          setSimCheckoutTotal(85);
        }
        if (step.browserState === 'biometric_prompt') setSimBiometricScanning(true);
        if (step.browserState === 'dashboard') {
          setSimBiometricScanning(false);
          setSimBiometricUnlocked(true);
        }
        if (step.browserState === 'kanban_updated' || step.value === 'SolarTech') {
          setSimKanbanLeads(prev => {
            if (prev.some(l => l.company === 'SolarTech')) return prev;
            return [...prev, { name: 'Robert Chen', company: 'SolarTech', value: '$15,000', stage: 'Proposal' }];
          });
        }

        setSimLogs(prev => [...prev, {
          timestamp: new Date().toTimeString().split(' ')[0],
          type: step.logType,
          message: step.log
        }]);

        idx++;
      };

      simulationTimerRef.current = setInterval(runNextStep, ms);
    }
  }, [isPaused, simSpeed]);

  const activeStep = currentStepIdx >= 0 && currentStepIdx < simSteps.length ? simSteps[currentStepIdx] : null;

  // Determine highlight coordinates on mock screen based on highlightSelector
  const getHighlightStyle = (): React.CSSProperties => {
    if (!activeStep || !activeStep.highlightSelector) return { display: 'none' };
    
    // Position bounding box depending on active step element keywords
    const sel = activeStep.highlightSelector;
    if (sel.includes('search-input')) {
      return { top: '50px', left: '160px', width: '180px', height: '28px' };
    }
    if (sel.includes('product-card')) {
      return { top: '235px', left: '20px', width: '150px', height: '140px' };
    }
    if (sel.includes('add-to-cart-btn')) {
      return { top: '300px', left: '190px', width: '160px', height: '32px' };
    }
    if (sel.includes('cart-badge')) {
      return { top: '12px', left: '330px', width: '45px', height: '24px' };
    }
    if (sel.includes('checkout-btn')) {
      return { top: '350px', left: '200px', width: '150px', height: '34px' };
    }
    if (sel.includes('promo-input')) {
      return { top: '212px', left: '20px', width: '220px', height: '28px' };
    }
    if (sel.includes('pay-btn')) {
      return { top: '315px', left: '20px', width: '300px', height: '32px' };
    }
    if (sel.includes('price-summary')) {
      return { top: '100px', left: '20px', width: '300px', height: '100px' };
    }
    // Mobile banking coordinates
    if (sel.includes('biometric-icon')) {
      return { top: '210px', left: '98px', width: '64px', height: '64px' };
    }
    if (sel.includes('transfer-amount-input')) {
      return { top: '150px', left: '15px', width: '230px', height: '30px' };
    }
    if (sel.includes('confirm-btn')) {
      return { top: '380px', left: '15px', width: '230px', height: '34px' };
    }
    if (sel.includes('receipt-card')) {
      return { top: '90px', left: '15px', width: '230px', height: '220px' };
    }
    // CRM coordinates
    if (sel.includes('add-lead-btn')) {
      return { top: '12px', left: '300px', width: '80px', height: '26px' };
    }
    if (sel.includes('crm-lead-form')) {
      return { top: '60px', left: '40px', width: '300px', height: '260px' };
    }
    if (sel.includes('form-company-name')) {
      return { top: '115px', left: '60px', width: '260px', height: '26px' };
    }
    if (sel.includes('save-lead-btn')) {
      return { top: '280px', left: '220px', width: '80px', height: '26px' };
    }
    if (sel.includes('kanban-card-new')) {
      return { top: '50px', left: '140px', width: '110px', height: '60px' };
    }

    return { display: 'none' };
  };

  return (
    <div className="executor-view">
      <div className="view-header">
        <h1>Execution Console</h1>
        <p>Interpret natural language instructions, compile step hierarchies, and visually observe the agent executing actions on the target application.</p>
      </div>

      {!activeAppId ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '3rem', marginTop: '1.5rem' }}>
          <p>Please select an application to enable execution tools.</p>
        </div>
      ) : (
        <div className="executor-layout">
          
          {/* Left panel: Log console and input triggers */}
          <div className="executor-controls-logs">
            
            {/* Input bar */}
            <div className="glass-card">
              <span className="selector-label" style={{ display: 'block', marginBottom: '0.55rem' }}>Natural Language Execution Script</span>
              <div className="prompt-bar-wrapper">
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="e.g. Add product retro runners, apply code SAVE15 and verify checkout..."
                  value={nlCommand}
                  onChange={(e) => setNlCommand(e.target.value)}
                  disabled={isSimulating}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}
                />
                
                {!isSimulating ? (
                  <button 
                    type="button" 
                    className="btn btn-accent"
                    onClick={startSimulation}
                    disabled={!nlCommand.trim()}
                  >
                    <Play size={16} />
                    <span>Run</span>
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    <button 
                      type="button" 
                      className="btn btn-secondary"
                      onClick={() => setIsPaused(!isPaused)}
                      title={isPaused ? 'Resume' : 'Pause'}
                    >
                      {isPaused ? <Play size={16} /> : <Pause size={16} />}
                    </button>
                    <button 
                      type="button" 
                      className="btn btn-danger"
                      onClick={handleCancelSimulation}
                      title="Stop Execution"
                    >
                      <RotateCcw size={16} />
                    </button>
                  </div>
                )}
              </div>

              {/* Speed selectors */}
              {isSimulating && (
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.8rem', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Simulation Speed:</span>
                  {[1, 2, 4].map(speed => (
                    <button
                      key={speed}
                      type="button"
                      className={`btn btn-secondary btn-small ${simSpeed === speed ? 'active-app-border' : ''}`}
                      onClick={() => setSimSpeed(speed)}
                      style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', borderColor: simSpeed === speed ? 'var(--accent-cyan)' : 'inherit' }}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Console Log window */}
            <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div className="console-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <TerminalIcon size={16} />
                  <span>Execution Logs</span>
                </div>
                {isSimulating && (
                  <span className="badge badge-purple" style={{ textTransform: 'none', fontSize: '0.65rem' }}>
                    {isPaused ? 'Paused' : `Running ${simSpeed}x`}
                  </span>
                )}
              </div>

              <div className="console-container" style={{ flex: 1, maxHeight: '350px', overflowY: 'auto' }}>
                {simLogs.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)' }}>Console ready. Provide a natural language command or select a test case to execute.</p>
                ) : (
                  simLogs.map((log, index) => (
                    <div key={index} className="console-log-line">
                      <span className="console-timestamp">[{log.timestamp}]</span>
                      <span className={`console-type-${log.type}`}>
                        {log.type.toUpperCase()}:
                      </span>
                      <span>{log.message}</span>
                    </div>
                  ))
                )}
                {isSimulating && !isPaused && <div className="console-log-line"><span className="console-cursor"></span></div>}
                <div ref={consoleEndRef} />
              </div>
            </div>
          </div>

          {/* Right panel: Simulated active UI viewport */}
          <div className="executor-sim-pane">
            <div className="browser-simulator">
              {/* Simulator Navbar */}
              <div className="browser-navbar">
                <div style={{ display: 'flex', gap: '4px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#cbd5e1' }}></span>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#cbd5e1' }}></span>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#cbd5e1' }}></span>
                </div>
                <div className="browser-address">
                  {activeApp?.platform === 'mobile' ? <Smartphone size={12} /> : <Globe size={12} />}
                  <span>{getAppUrl()}</span>
                </div>
              </div>

              {/* Viewport content */}
              <div className="browser-viewport">
                
                {/* Element scanner highlighter overlays */}
                {activeStep && activeStep.highlightSelector && (
                  <div className="browser-element-highlight" style={getHighlightStyle()}>
                    <span className="browser-element-highlight-label">
                      {activeStep.highlightText || 'element'}
                    </span>
                  </div>
                )}

                {/* 1. SWIFTCART MOCK VIEWS */}
                {activeAppId === 'app-swiftcart' && (
                  <div style={{ display: 'flex', flexDirection: 'column', height: '100%', color: '#1e293b' }}>
                    {/* Header */}
                    <div className="sim-app-header">
                      <span className="sim-logo">SWIFTCART</span>
                      <div className="sim-nav">
                        <span>Shop</span>
                        <span>Categories</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span>Cart</span>
                          <span className="sim-cart-badge">{simCartCount}</span>
                        </div>
                      </div>
                    </div>

                    {/* Viewport body screens */}
                    <div className="sim-body">
                      {(!activeStep || activeStep.browserState === 'init' || activeStep.browserState === 'login') && (
                        <div className="sim-form" style={{ marginTop: '2rem' }}>
                          <h3 style={{ color: '#0f172a', fontSize: '1rem', textAlign: 'center', marginBottom: '0.5rem' }}>Customer Login</h3>
                          <div className="sim-form-group">
                            <label>Email Address</label>
                            <input type="text" placeholder="user@example.com" readOnly value="user@example.com" />
                          </div>
                          <div className="sim-form-group">
                            <label>Password</label>
                            <input type="password" placeholder="••••••••••••" readOnly value="123456" />
                          </div>
                          <button type="button" className="sim-btn sim-btn-primary" style={{ marginTop: '0.5rem' }}>Sign In</button>
                        </div>
                      )}

                      {activeStep && (activeStep.browserState === 'catalog' || activeStep.browserState === 'search_results') && (
                        <div>
                          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                            <input 
                              type="text" 
                              className="sim-search-input" 
                              placeholder="Search sneakers..." 
                              value={simSearchTerm} 
                              readOnly 
                              style={{ flex: 1, padding: '0.35rem 0.5rem', fontSize: '0.75rem', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                            />
                            <button type="button" className="sim-btn" style={{ padding: '0.2rem 0.6rem' }}>Search</button>
                          </div>
                          
                          {activeStep.browserState === 'catalog' ? (
                            <div className="sim-grid">
                              <div className="sim-product-card">
                                <div style={{ width: '100%', height: '60px', backgroundColor: '#e2e8f0', borderRadius: '4px' }}></div>
                                <span className="sim-product-title">Retro Runner Sneakers</span>
                                <span className="sim-product-price">$100.00</span>
                              </div>
                              <div className="sim-product-card">
                                <div style={{ width: '100%', height: '60px', backgroundColor: '#e2e8f0', borderRadius: '4px' }}></div>
                                <span className="sim-product-title">Leather Boots</span>
                                <span className="sim-product-price">$140.00</span>
                              </div>
                            </div>
                          ) : (
                            <div className="sim-grid">
                              <div className="sim-product-card" style={{ border: '2px solid #3b82f6' }}>
                                <div style={{ width: '100%', height: '60px', backgroundColor: '#e2e8f0', borderRadius: '4px' }}></div>
                                <span className="sim-product-title">Retro Runner Sneakers</span>
                                <span className="sim-product-price">$100.00</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {activeStep && (activeStep.browserState === 'product_details' || activeStep.browserState === 'product_details_added') && (
                        <div style={{ display: 'flex', gap: '1rem', background: 'white', padding: '1rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                          <div style={{ width: '100px', height: '100px', backgroundColor: '#e2e8f0', borderRadius: '4px', flexShrink: 0 }}></div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
                            <h3 style={{ color: '#0f172a', fontSize: '1rem' }}>Retro Runner Sneakers</h3>
                            <span style={{ fontWeight: 800, fontSize: '0.9rem' }}>$100.00</span>
                            <div style={{ display: 'flex', gap: '0.25rem', fontSize: '0.7rem' }}>
                              <span style={{ border: '1px solid #cbd5e1', padding: '1px 4px', borderRadius: '3px' }}>9</span>
                              <span style={{ border: '2px solid #3b82f6', padding: '1px 4px', borderRadius: '3px', fontWeight: 'bold' }}>10</span>
                              <span style={{ border: '1px solid #cbd5e1', padding: '1px 4px', borderRadius: '3px' }}>11</span>
                            </div>
                            <button type="button" className="sim-btn sim-btn-primary sim-add-to-cart-btn" style={{ fontSize: '0.7rem', padding: '0.35rem' }}>
                              {simCartCount > 0 ? 'Added!' : 'Add to Cart'}
                            </button>
                          </div>
                        </div>
                      )}

                      {activeStep && (
                        activeStep.browserState === 'checkout' || 
                        activeStep.browserState === 'checkout_promo' || 
                        activeStep.browserState === 'checkout_promo_applied' ||
                        activeStep.browserState === 'checkout_promo_error'
                      ) && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '0.75rem' }}>
                          <div className="checkout-form" style={{ background: 'white', padding: '0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.8rem', color: '#0f172a' }}>Shipping Info</span>
                            <input type="text" placeholder="John Doe" value="John Doe" readOnly style={{ padding: '0.25rem', fontSize: '0.7rem' }} />
                            <input type="text" placeholder="123 Main St" value="123 Main St" readOnly style={{ padding: '0.25rem', fontSize: '0.7rem' }} />
                            
                            <span style={{ fontWeight: 700, fontSize: '0.8rem', color: '#0f172a', marginTop: '0.25rem' }}>Payment (Credit Card)</span>
                            <input type="text" placeholder="Card number" value="4111 2222 3333 4444" readOnly style={{ padding: '0.25rem', fontSize: '0.7rem' }} />
                            <button type="button" className="sim-btn sim-btn-primary pay-btn" style={{ padding: '0.35rem', fontSize: '0.7rem' }}>Pay Now</button>
                          </div>

                          <div className="price-summary" style={{ background: 'white', padding: '0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.75rem' }}>
                            <span style={{ fontWeight: 700, color: '#0f172a' }}>Price Summary</span>
                            <div style={{ display: 'flex', justifyItems: 'space-between', justifyContent: 'space-between' }}>
                              <span>Subtotal</span>
                              <span>$100.00</span>
                            </div>
                            <div style={{ display: 'flex', gap: '0.25rem' }}>
                              <input 
                                type="text" 
                                className="promo-input" 
                                placeholder="Promo code" 
                                value={simPromoCode} 
                                readOnly 
                                style={{ width: '100%', padding: '0.25rem', fontSize: '0.7rem' }} 
                              />
                              <button type="button" className="sim-btn" style={{ padding: '0.15rem 0.4rem', fontSize: '0.65rem' }}>Apply</button>
                            </div>
                            
                            {activeStep.browserState === 'checkout_promo_error' && (
                              <span className="promo-error" style={{ color: '#ef4444', fontSize: '0.65rem', fontWeight: 600 }}>
                                Error: Coupon service 500 error!
                              </span>
                            )}

                            {simPromoApplied && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16a34a', fontWeight: 600 }}>
                                <span>Discount (15%)</span>
                                <span>-$15.00</span>
                              </div>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, borderTop: '1px solid #cbd5e1', paddingTop: '0.25rem', color: '#0f172a' }}>
                              <span>Total</span>
                              <span>${simCheckoutTotal.toFixed(2)}</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {activeStep && activeStep.browserState === 'order_success' && (
                        <div className="order-success-screen" style={{ textAlign: 'center', padding: '2rem 1rem', background: 'white', borderRadius: '6px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <CheckCircle size={28} />
                          </div>
                          <h3 style={{ color: '#0f172a', fontSize: '1.1rem', margin: 0 }}>Order Confirmed!</h3>
                          <p style={{ fontSize: '0.75rem', color: '#64748b' }}>Order confirmation number: <strong>#SC-9041</strong></p>
                          <p style={{ fontSize: '0.7rem', color: '#94a3b8' }}>A confirmation email has been dispatched to user@example.com.</p>
                        </div>
                      )}

                    </div>
                  </div>
                )}

                {/* 2. APEX BANK MOBILE VIEWS */}
                {activeAppId === 'app-apexbank' && (
                  <div style={{ display: 'flex', flex: 1, backgroundColor: '#09090b', padding: '1rem' }}>
                    <div className="phone-frame">
                      <div className="phone-speaker"></div>
                      <div className="phone-screen">
                        
                        {/* Biometric Scan Prompt */}
                        {!simBiometricUnlocked && (!activeStep || activeStep.browserState === 'init' || activeStep.browserState === 'biometric_prompt') && (
                          <div className="biometric-unlock-screen">
                            <h3 style={{ color: 'white' }}>Apex Banking</h3>
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Biometric security unlock required.</p>
                            
                            <div className="biometric-icon-glow" style={{ animation: simBiometricScanning ? 'pulse-glow 1s infinite' : 'none' }}>
                              <Fingerprint size={32} />
                            </div>

                            <span style={{ fontSize: '0.7rem', color: simBiometricScanning ? 'var(--accent-cyan)' : 'var(--text-muted)' }}>
                              {simBiometricScanning ? 'Scanning fingerprint...' : 'Touch sensor to scan'}
                            </span>
                          </div>
                        )}

                        {/* Account Dashboard screen */}
                        {activeStep && (activeStep.browserState === 'dashboard' || activeStep.browserState === 'transfer_form' || activeStep.browserState === 'transfer_review' || activeStep.browserState === 'transfer_receipt' || activeStep.browserState === 'transfer_processing') && (
                          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                            <div className="banking-header">
                              <span style={{ fontWeight: 800, fontSize: '0.8rem' }}>APEX MOBILE</span>
                              <span className="badge badge-purple" style={{ fontSize: '0.6rem', padding: '2px 6px' }}>Gold tier</span>
                            </div>

                            <div className="banking-body">
                              
                              {(activeStep.browserState === 'dashboard') && (
                                <>
                                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                                    <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Checking Account balance</span>
                                    <h3 style={{ fontSize: '1.25rem', color: 'white', fontWeight: 700, margin: '2px 0' }}>$5,240.50</h3>
                                    <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Account #•••• 0981</span>
                                  </div>

                                  <div className="transfer-nav-btn" style={{ background: 'linear-gradient(to right, var(--accent-purple), #6d28d9)', padding: '0.6rem', borderRadius: '6px', textAlign: 'center', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>
                                    Send Money Transfer
                                  </div>
                                </>
                              )}

                              {(activeStep.browserState === 'transfer_form' || activeStep.browserState === 'transfer_review' || activeStep.browserState === 'transfer_receipt' || activeStep.browserState === 'transfer_processing') && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                  <span style={{ fontSize: '0.75rem', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.25rem' }}>
                                    Transfer Beneficiary
                                  </span>

                                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.5rem', borderRadius: '4px', fontSize: '0.7rem' }}>
                                    <div style={{ color: 'var(--text-secondary)' }}>Recipient</div>
                                    <div style={{ fontWeight: 'bold', color: 'white' }}>Jane Doe (External Checking)</div>
                                  </div>

                                  <div className="transfer-amount-input" style={{ background: 'rgba(255,255,255,0.02)', padding: '0.5rem', borderRadius: '4px', fontSize: '0.7rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                    <span style={{ color: 'var(--text-secondary)' }}>Amount</span>
                                    <span style={{ color: 'white', fontWeight: 'bold', fontSize: '0.85rem' }}>$250.00</span>
                                  </div>

                                  {activeStep.browserState === 'transfer_form' && (
                                    <button type="button" className="sim-btn sim-btn-primary" style={{ padding: '0.35rem' }}>Verify Details</button>
                                  )}

                                  {activeStep.browserState === 'transfer_review' && (
                                    <button type="button" className="sim-btn confirm-btn" style={{ padding: '0.35rem', backgroundColor: 'var(--accent-cyan)', color: 'black' }}>
                                      Confirm Transfer
                                    </button>
                                  )}

                                  {activeStep.browserState === 'transfer_processing' && (
                                    <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--accent-cyan)', fontSize: '0.7rem' }}>
                                      Sending secure token SMS OTP confirmation...
                                    </div>
                                  )}

                                  {activeStep.browserState === 'transfer_receipt' && (
                                    <div className="receipt-card" style={{ background: 'rgba(0, 255, 136, 0.05)', border: '1px dashed var(--color-success)', padding: '0.75rem', borderRadius: '8px', fontSize: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(0,255,136,0.1)', paddingBottom: '0.25rem', fontWeight: 'bold', color: 'var(--color-success)' }}>
                                        <span>TRANSFER RECEIPT</span>
                                        <span>SUCCESS</span>
                                      </div>
                                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>Reference #</span>
                                        <span>TRX-9082</span>
                                      </div>
                                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>To Recipient</span>
                                        <span>Jane Doe</span>
                                      </div>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                                        <span>Sent Value</span>
                                        <span>$250.00</span>
                                      </div>
                                    </div>
                                  )}

                                </div>
                              )}

                            </div>
                          </div>
                        )}

                      </div>
                    </div>
                  </div>
                )}

                {/* 3. ZETA CRM PORTAL VIEWS */}
                {activeAppId === 'app-zetacrm' && (
                  <div style={{ display: 'flex', flexDirection: 'column', height: '100%', color: '#1e293b' }}>
                    <div className="sim-app-header">
                      <span className="sim-logo" style={{ color: 'var(--accent-purple)' }}>ZETA CRM</span>
                      <div className="sim-nav">
                        <button type="button" className="btn btn-accent btn-small add-lead-btn" style={{ padding: '0.15rem 0.5rem', fontSize: '0.65rem' }}>
                          + Add Lead
                        </button>
                      </div>
                    </div>

                    <div className="sim-body" style={{ padding: '0.5rem' }}>
                      <div className="kanban-board-sim">
                        
                        <div className="kanban-col">
                          <span className="kanban-col-title">Lead In</span>
                          {simKanbanLeads.filter(l => l.stage === 'Lead In').map((l, i) => (
                            <div key={i} className="kanban-card">
                              <strong style={{ color: '#0f172a' }}>{l.company}</strong>
                              <span>{l.name} • {l.value}</span>
                            </div>
                          ))}
                        </div>

                        <div className="kanban-col">
                          <span className="kanban-col-title">Contacted</span>
                          {simKanbanLeads.filter(l => l.stage === 'Contacted').map((l, i) => (
                            <div key={i} className="kanban-card">
                              <strong style={{ color: '#0f172a' }}>{l.company}</strong>
                              <span>{l.name} • {l.value}</span>
                            </div>
                          ))}
                        </div>

                        <div className="kanban-col">
                          <span className="kanban-col-title">Proposal</span>
                          {simKanbanLeads.filter(l => l.stage === 'Proposal').map((l, i) => (
                            <div key={i} className={`kanban-card ${l.company === 'SolarTech' ? 'kanban-card-new' : ''}`} style={l.company === 'SolarTech' ? { border: '2px solid var(--accent-purple)' } : {}}>
                              <strong style={{ color: '#0f172a' }}>{l.company}</strong>
                              <span>{l.name} • {l.value}</span>
                            </div>
                          ))}
                        </div>

                      </div>

                      {/* Add Lead Form Dialog Overlay inside simulated browser */}
                      {activeStep && (activeStep.browserState === 'add_lead_modal') && (
                        <div className="crm-lead-form" style={{ position: 'absolute', top: '50px', left: '40px', right: '40px', background: 'white', padding: '0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', boxShadow: '0 4px 10px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.7rem' }}>
                          <span style={{ fontWeight: 'bold', color: '#0f172a' }}>Add Pipeline Lead</span>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                            <label>Company Name</label>
                            <input type="text" className="form-company-name" value="SolarTech" readOnly style={{ padding: '0.2rem', fontSize: '0.65rem' }} />
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                            <label>Contact Name</label>
                            <input type="text" value="Robert Chen" readOnly style={{ padding: '0.2rem', fontSize: '0.65rem' }} />
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                            <label>Value ($)</label>
                            <input type="text" value="$15,000" readOnly style={{ padding: '0.2rem', fontSize: '0.65rem' }} />
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                            <label>Stage</label>
                            <input type="text" value="Proposal Sent" readOnly style={{ padding: '0.2rem', fontSize: '0.65rem' }} />
                          </div>
                          <button type="button" className="sim-btn sim-btn-primary save-lead-btn" style={{ padding: '0.25rem', marginTop: '0.25rem' }}>Save Lead</button>
                        </div>
                      )}

                    </div>
                  </div>
                )}

              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
};
