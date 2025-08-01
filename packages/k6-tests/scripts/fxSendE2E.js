import http from 'k6/http';
import { check, group } from 'k6';
// import { crypto } from "k6/experimental/webcrypto";
import { WebSocket } from 'k6/experimental/websockets';
import { setTimeout, clearTimeout } from 'k6/timers';
import { Trace } from "../common/trace.js";
import { getTwoItemsFromArray } from "../common/utils.js";
import exec from 'k6/execution';
import { replaceHeaders } from '../common/replaceHeaders.js';
import { ulid } from '../common/uuid.js'

function log() {
  console.log('Env Vars -->');
  console.log(`  K6_SCRIPT_WS_TIMEOUT_MS=${__ENV.K6_SCRIPT_WS_TIMEOUT_MS}`);
  console.log(`  K6_SCRIPT_FSPIOP_ALS_ENDPOINT_URL=${__ENV.K6_SCRIPT_FSPIOP_ALS_ENDPOINT_URL}`);
  console.log(`  K6_SCRIPT_ADMIN_ENDPOINT_URL=${__ENV.K6_SCRIPT_ADMIN_ENDPOINT_URL}`);
  console.log(`  K6_SCRIPT_ORACLE_ENDPOINT_URL=${__ENV.K6_SCRIPT_ORACLE_ENDPOINT_URL}`);
  console.log(`  K6_SCRIPT_FSPIOP_FSP_POOL=${__ENV.K6_SCRIPT_FSPIOP_FSP_POOL}`);
}

const fspList = JSON.parse(__ENV.K6_SCRIPT_FSPIOP_FSP_POOL || '[]');
const ilpPacket = __ENV.K6_SCRIPT_FSPIOP_TRANSFERS_ILPPACKET
const condition = __ENV.K6_SCRIPT_FSPIOP_TRANSFERS_CONDITION
const amount = __ENV.K6_SCRIPT_FX_E2E_SOURCE_AMOUNT?.toString() || '2'
const currency = __ENV.K6_SCRIPT_FX_E2E_SOURCE_CURRENCY
const targetAmount = __ENV.K6_SCRIPT_FX_E2E_TARGET_AMOUNT?.toString() || '2'
const targetCurrency = __ENV.K6_SCRIPT_FX_E2E_TARGET_CURRENCY
const abortOnError = (__ENV.K6_SCRIPT_ABORT_ON_ERROR && __ENV.K6_SCRIPT_ABORT_ON_ERROR.toLowerCase() === 'true') ? true : false

export function fxSendE2E() {
  !exec.instance.iterationsCompleted && (exec.vu.idInTest === 1) && log();
  group("fxSendE2E", function () {
    let payerFsp
    let payeeFsp

    if (__ENV.UNIDIRECTIONAL === "true" || __ENV.UNIDIRECTIONAL === "TRUE") {
      payerFsp = fspList[0]
      payeeFsp =  fspList[1]
    } else {
      const selectedFsps = getTwoItemsFromArray(fspList)
      payerFsp = selectedFsps[0]
      payeeFsp =  selectedFsps[1]
    }

    const startTsParties = Date.now();
    const payeeId = payeeFsp['partyId'];
    const payerFspId = payerFsp['fspId'];
    const payeeFspId = payeeFsp['fspId'];
    const fxpId = 'perffxp';
    const wsUrl = payerFsp['wsUrl'];
    const traceParent = Trace();
    const traceId = traceParent.traceId;
    const transactionId = ulid();
    const conversionId = ulid();
    const wsTimeoutMs = Number(__ENV.K6_SCRIPT_WS_TIMEOUT_MS) || 2000; // user session between 5s and 1m

    const idType = __ENV.K6_SCRIPT_ID_TYPE || 'ACCOUNT_ID';
    const wsChannelParties = `${traceParent.traceId}/PUT/parties/${idType}/${payeeId}`;
    const wsURLParties = `${wsUrl}/${wsChannelParties}`
    const wsParties = new WebSocket(wsURLParties, null, {tags: {name: 'e2e parties ws'}});

    var wsTimeoutId = null;

    const clearTimersParties = () => {
      if (wsTimeoutId) { clearTimeout(wsTimeoutId); wsTimeoutId=null }
    }

    wsParties.onclose(() => {
      clearTimersParties();
    });

    wsParties.onerror((err) => {
      console.error(traceId, err);
      check(err, { 'ALS_E2E_FSPIOP_GET_PARTIES_SUCCESS': (cbMessage) => false });
      clearTimersParties();
      wsParties.close();
    });

    wsParties.onmessage = (event) => {
      __ENV.K6_DEBUG && console.info(traceId, `WS message received [${wsChannelParties}]: ${event.data}`);
      check(event.data, { 'ALS_E2E_FSPIOP_GET_PARTIES_SUCCESS': (cbMessage) => cbMessage == 'SUCCESS_CALLBACK_RECEIVED' });
      clearTimersParties();
      wsParties.close();

      const startTsFxQuotes = Date.now();
      const conversionRequestId = ulid();
      const wsChannelFxQuotes = `${traceParent.traceId}/PUT/fxQuotes/${conversionRequestId}`;
      const wsURLFxQuotes = `${wsUrl}/${wsChannelFxQuotes}`
      const wsFxQuotes = new WebSocket(wsURLFxQuotes, null, {tags: {name: 'e2e fxquotes ws'}});

      var wsTimeoutId = null;

      const clearTimersFxQuotes = () => {
        if (wsTimeoutId) { clearTimeout(wsTimeoutId); wsTimeoutId=null }
      }

      wsFxQuotes.onclose(() => {
        clearTimersFxQuotes();
      });

      wsFxQuotes.onerror((err) => {
        console.error(traceId, err);
        check(err, { 'FXQUOTES_E2E_FSPIOP_POST_FXQUOTES_SUCCESS': (cbMessage) => false });
        clearTimersFxQuotes();
        wsFxQuotes.close();
      });

      wsFxQuotes.onmessage = (event) => {
        __ENV.K6_DEBUG && console.info(traceId, `WS message received [${wsChannelFxQuotes}]: ${event.data}`);
        check(event.data, { 'FXQUOTES_E2E_FSPIOP_POST_FXQUOTES_SUCCESS': (cbMessage) => cbMessage == 'SUCCESS_CALLBACK_RECEIVED' });
        clearTimersFxQuotes();
        wsFxQuotes.close();

        const startTsQuotes = Date.now();
        const quoteId = ulid();
        const wsChannelQuotes = `${traceParent.traceId}/PUT/quotes/${quoteId}`;
        const wsURLQuotes = `${wsUrl}/${wsChannelQuotes}`
        const wsQuotes = new WebSocket(wsURLQuotes, null, {tags: {name: 'e2e quotes ws'}});

        var wsTimeoutId = null;

        const clearTimersQuotes = () => {
          if (wsTimeoutId) { clearTimeout(wsTimeoutId); wsTimeoutId=null }
        }

        wsQuotes.onclose(() => {
          clearTimersQuotes();
        });

        wsQuotes.onerror((err) => {
          console.error(traceId, err);
          check(err, { 'QUOTES_E2E_FSPIOP_POST_QUOTES_SUCCESS': (cbMessage) => false });
          clearTimersQuotes();
          wsQuotes.close();
        });

        wsQuotes.onmessage = (event) => {
          __ENV.K6_DEBUG && console.info(traceId, `WS message received [${wsChannelQuotes}]: ${event.data}`);
          check(event.data, { 'QUOTES_E2E_FSPIOP_POST_QUOTES_SUCCESS': (cbMessage) => cbMessage == 'SUCCESS_CALLBACK_RECEIVED' });
          clearTimersQuotes();
          wsQuotes.close();

          const startTsFxTransfers = Date.now();
          const commitRequestId = conversionId;
          const wsChannelFxTransfers = `${traceParent.traceId}/PUT/fxTransfers/${commitRequestId}`;
          const wsURLFxTransfers = `${wsUrl}/${wsChannelFxTransfers}`
          const wsFxTransfers = new WebSocket(wsURLFxTransfers, null, {tags: {name: 'e2e fxTransfers ws'}});

          var wsTimeoutId = null;

          const clearTimersFxTransfers = () => {
            if (wsTimeoutId) { clearTimeout(wsTimeoutId); wsTimeoutId=null }
          }

          wsFxTransfers.onclose(() => {
            clearTimersFxTransfers();
          });

          wsFxTransfers.onerror((err) => {
            console.error(traceId, err);
            check(err, { 'FXTRANSFERS_E2E_FSPIOP_POST_FXTRANSFERS_SUCCESS': (cbMessage) => false });
            clearTimersFxTransfers();
            wsFxTransfers.close();
          });

          wsFxTransfers.onmessage = (event) => {
            __ENV.K6_DEBUG && console.info(traceId, `WS message received [${wsChannelFxTransfers}]: ${event.data}`);
            check(event.data, { 'FXTRANSFERS_E2E_FSPIOP_POST_FXTRANSFERS_SUCCESS': (cbMessage) => cbMessage == 'SUCCESS_CALLBACK_RECEIVED' });
            clearTimersFxTransfers();
            wsFxTransfers.close();

            const startTsTransfers = Date.now();
            const transferId = transactionId;
            const wsChannelTransfers = `${traceParent.traceId}/PUT/transfers/${transferId}`;
            const wsURLTransfers = `${wsUrl}/${wsChannelTransfers}`
            const wsTransfers = new WebSocket(wsURLTransfers, null, {tags: {name: 'e2e transfers ws'}});

            var wsTimeoutId = null;

            const clearTimersTransfers = () => {
              if (wsTimeoutId) { clearTimeout(wsTimeoutId); wsTimeoutId=null }
            }

            wsTransfers.onclose(() => {
              clearTimersTransfers();
            });

            wsTransfers.onerror((err) => {
              console.error(traceId, err);
              check(err, { 'TRANSFERS_E2E_FSPIOP_POST_TRANSFERS_SUCCESS': (cbMessage) => false });
              clearTimersTransfers();
              wsTransfers.close();
            });

            wsTransfers.onmessage = (event) => {
              __ENV.K6_DEBUG && console.info(traceId, `WS message received [${wsChannelTransfers}]: ${event.data}`);
              check(event.data, { 'TRANSFERS_E2E_FSPIOP_POST_TRANSFERS_SUCCESS': (cbMessage) => cbMessage == 'SUCCESS_CALLBACK_RECEIVED' });
              clearTimersTransfers();
              wsTransfers.close();
            };

            wsTransfers.onopen = () => {
              __ENV.K6_DEBUG && console.info(traceId, `WS open on URL: ${wsUrl}`);
              const params = {
                tags: {
                  payerFspId,
                  payeeFspId
                },
                headers: replaceHeaders({
                  'Accept': 'application/vnd.interoperability.transfers+json;version=2.0',
                  'Content-Type': 'application/vnd.interoperability.transfers+json;version=2.0',
                  'FSPIOP-Source': payerFspId,
                  'FSPIOP-Destination': payeeFspId,
                  'Date': (new Date()).toUTCString(),
                  'traceparent': traceParent.toString(),
                  'tracestate': `tx_end2end_start_ts=${startTsTransfers}`
                }),
              };

              const msgId = ulid();
              const body = __ENV.API_TYPE === 'iso20022' ? {
                GrpHdr: {
                  MsgId: msgId,
                  CreDtTm: new Date().toISOString(),
                  NbOfTxs: '1',
                  SttlmInf: {
                    SttlmMtd: 'CLRG'
                  },
                  PmtInstrXpryDtTm: '2030-01-01T00:00:00.000Z'
                },
                CdtTrfTxInf: {
                  PmtId: {
                    TxId: transferId
                  },
                  ChrgBr: 'SHAR',
                  Cdtr: {
                    Id: {
                      OrgId: {
                        Othr: {
                          Id: payeeFspId
                        }
                      }
                    }
                  },
                  Dbtr: {
                    Id: {
                      OrgId: {
                        Othr: {
                          Id: payerFspId
                        }
                      }
                    }
                  },
                  CdtrAgt: {
                    FinInstnId: {
                      Othr: {
                        Id: payeeFspId
                      }
                    }
                  },
                  DbtrAgt: {
                    FinInstnId: {
                      Othr: {
                        Id: payerFspId
                      }
                    }
                  },
                  IntrBkSttlmAmt: {
                    Ccy: targetCurrency,
                    ActiveCurrencyAndAmount: `${targetAmount}`
                  },
                  VrfctnOfTerms: {
                    IlpV4PrepPacket: ilpPacket
                  }
                }
              } : {
                "transferId": transferId,
                "payerFsp": payerFspId,
                "payeeFsp": payeeFspId,
                "amount": {
                  amount: targetAmount,
                  currency: targetCurrency
                },
                "expiration": "2030-01-01T00:00:00.000Z",
                ilpPacket,
                condition
              }

              // Lets send the FSPIOP POST /transfers request
              const res = http.post(`${__ENV.K6_SCRIPT_FSPIOP_TRANSFERS_ENDPOINT_URL}/transfers`, JSON.stringify(body), params);
              check(res, { 'TRANSFERS_FSPIOP_POST_TRANSFERS_RESPONSE_IS_202' : (r) => r.status == 202 });

              if (abortOnError && res.status != 202) {
                // Abort the entire k6 test execution runner
                console.error(traceId, `FSPIOP POST /transfers returned status: ${res.status}`);
                wsTransfers.close();
                exec.test.abort()
              }

              wsTimeoutId = setTimeout(() => {
                const errorMsg = `WS timed-out on URL: ${wsURLTransfers}`
                console.error(traceId, errorMsg);
                check(res, { 'TRANSFERS_E2E_FSPIOP_POST_TRANSFERS_SUCCESS': (cbMessage) => false });
                wsTransfers.close();
                if (abortOnError) {
                  // Abort the entire k6 test execution runner
                  console.error(traceId, 'Aborting k6 test execution!')
                  exec.test.abort()
                }
              }, wsTimeoutMs);
            };
          };

          wsFxTransfers.onopen = () => {
            __ENV.K6_DEBUG && console.info(traceId, `WS open on URL: ${wsUrl}`);
            const params = {
              tags: {
                payerFspId,
                fxpId
              },
              headers: replaceHeaders({
                'Accept': 'application/vnd.interoperability.fxTransfers+json;version=2.0',
                'Content-Type': 'application/vnd.interoperability.fxTransfers+json;version=2.0',
                'FSPIOP-Source': payerFspId,
                'FSPIOP-Destination': fxpId,
                'Date': (new Date()).toUTCString(),
                'traceparent': traceParent.toString(),
                'tracestate': `tx_end2end_start_ts=${startTsFxTransfers}`
              }),
            };

            const msgId = ulid();
            const body = __ENV.API_TYPE === 'iso20022' ? {
              GrpHdr: {
                MsgId: msgId,
                CreDtTm: new Date().toISOString(),
                NbOfTxs: '1',
                SttlmInf: {
                  SttlmMtd: 'CLRG'
                },
                PmtInstrXpryDtTm: '2030-01-01T00:00:00.000Z'
              },
              CdtTrfTxInf: {
                PmtId: {
                  TxId: commitRequestId,
                  EndToEndId: transactionId
                },
                Dbtr: {
                  FinInstnId: {
                    Othr: {
                      Id: payerFspId
                    }
                  }
                },
                UndrlygCstmrCdtTrf: {
                  Dbtr: {
                    Id: {
                      OrgId: {
                        Othr: {
                          Id: payerFspId
                        }
                      }
                    }
                  },
                  DbtrAgt: {
                    FinInstnId: {
                      Othr: {
                        Id: payerFspId
                      }
                    }
                  },
                  Cdtr: {
                    Id: {
                      OrgId: {
                        Othr: {
                          Id: fxpId
                        }
                      }
                    }
                  },
                  CdtrAgt: {
                    FinInstnId: {
                      Othr: {
                        Id: fxpId
                      }
                    }
                  },
                  InstdAmt: {
                    Ccy: currency,
                    ActiveOrHistoricCurrencyAndAmount: `${amount}`
                  }
                },
                Cdtr: {
                  FinInstnId: {
                    Othr: {
                      Id: fxpId
                    }
                  }
                },
                IntrBkSttlmAmt: {
                  Ccy: targetCurrency,
                  ActiveCurrencyAndAmount: `${targetAmount}`
                },
                VrfctnOfTerms: {
                  Sh256Sgntr: condition
                }
              }
            } : {
              "commitRequestId": commitRequestId,
              "determiningTransferId": transactionId,
              "initiatingFsp": payerFspId,
              "counterPartyFsp": fxpId,
              "sourceAmount": {
                amount,
                currency
              },
              "targetAmount": {
                amount: targetAmount,
                currency: targetCurrency
              },
              "expiration": "2030-01-01T00:00:00.000Z",
              condition
            }

            // Lets send the FSPIOP POST /transfers request
            const res = http.post(`${__ENV.K6_SCRIPT_FSPIOP_TRANSFERS_ENDPOINT_URL}/fxTransfers`, JSON.stringify(body), params);
            check(res, { 'FXTRANSFERS_FSPIOP_POST_FXTRANSFERS_RESPONSE_IS_202' : (r) => r.status == 202 });

            if (abortOnError && res.status != 202) {
              // Abort the entire k6 test execution runner
              console.error(traceId, `FSPIOP POST /fxTransfers returned status: ${res.status}`);
              wsFxTransfers.close();
              exec.test.abort()
            }

            wsTimeoutId = setTimeout(() => {
              const errorMsg = `WS timed-out on URL: ${wsURLFxTransfers}`
              console.error(traceId, errorMsg);
              check(res, { 'FXTRANSFERS_E2E_FSPIOP_POST_FXTRANSFERS_SUCCESS': (cbMessage) => false });
              wsFxTransfers.close();
              if (abortOnError) {
                // Abort the entire k6 test execution runner
                console.error(traceId, 'Aborting k6 test execution!')
                exec.test.abort()
              }
            }, wsTimeoutMs);
          };
        };

        wsQuotes.onopen = () => {
          __ENV.K6_DEBUG && console.info(traceId, `WS open on URL: ${wsURLQuotes}`);
          const params = {
            tags: {
              payerFspId,
              payeeFspId
            },
            headers: replaceHeaders({
              'Accept': 'application/vnd.interoperability.quotes+json;version=2.0',
              'Content-Type': 'application/vnd.interoperability.quotes+json;version=2.0',
              'FSPIOP-Source': payerFspId,
              'FSPIOP-Destination': payeeFspId,
              'Date': (new Date()).toUTCString(),
              'traceparent': traceParent.toString(),
              'tracestate': `tx_end2end_start_ts=${startTsQuotes}`
            }),
          };

          const msgId = ulid();
          const body = __ENV.API_TYPE === 'iso20022' ? {
            GrpHdr: {
              MsgId: msgId,
              CreDtTm: new Date().toISOString(),
              NbOfTxs: '1',
              SttlmInf: {
                SttlmMtd: 'CLRG'
              }
            },
            CdtTrfTxInf: {
              PmtId: {
                TxId: quoteId,
                EndToEndId: transactionId
              },
              Cdtr: {
                Id: {
                  PrvtId: {
                    Othr: {
                      SchmeNm: {
                        Prtry: `${idType}`
                      },
                      Id: payeeFsp['partyId']
                    }
                  }
                }
              },
              CdtrAgt: {
                FinInstnId: {
                  Othr: {
                    Id: payeeFspId
                  }
                }
              },
              Dbtr: {
                Id: {
                  PrvtId: {
                    Othr: {
                      SchmeNm: {
                        Prtry: `${idType}`
                      },
                      Id: payerFsp['partyId']
                    }
                  }
                }
              },
              DbtrAgt: {
                FinInstnId: {
                  Othr: {
                    Id: payeeFspId
                  }
                }
              },
              IntrBkSttlmAmt: {
                Ccy: targetCurrency,
                ActiveCurrencyAndAmount: `${targetAmount}`
              },
              Purp: {
                Prtry: 'TRANSFER'
              },
              ChrgBr: 'DEBT'
            }
          } : {
            "quoteId": quoteId,
            "transactionId": transactionId,
            "payer": {
              "partyIdInfo": {
                "partyIdType": `${idType}`,
                "partyIdentifier": `${payerFsp['partyId']}`,
                "fspId": payerFspId
              }
            },
            "payee": {
              "partyIdInfo": {
                "partyIdType": `${idType}`,
                "partyIdentifier": `${payeeFsp['partyId']}`,
                "fspId": payeeFspId
              }
            },
            "amountType": "SEND",
            "amount": {
              "amount": `${targetAmount}`,
              "currency": `${targetCurrency}`
            },
            "transactionType": {
              "scenario": "TRANSFER",
              "initiator": "PAYER",
              "initiatorType": "CONSUMER"
            }
          }

          // Lets send the FSPIOP POST /quotes request
          const res = http.post(`${__ENV.K6_SCRIPT_FSPIOP_QUOTES_ENDPOINT_URL}/quotes`, JSON.stringify(body), params);
          check(res, { 'QUOTES_FSPIOP_POST_QUOTES_RESPONSE_IS_202' : (r) => r.status == 202 });

          wsTimeoutId = setTimeout(() => {
            const errorMsg = `WS timed-out on URL: ${wsURLQuotes}`
            console.error(traceId, errorMsg);
            check(res, { 'QUOTES_E2E_FSPIOP_POST_QUOTES_SUCCESS': (cbMessage) => false });
            wsQuotes.close();
          }, wsTimeoutMs);
        };

      };

      wsFxQuotes.onopen = () => {
        __ENV.K6_DEBUG && console.info(traceId, `WS open on URL: ${wsURLFxQuotes}`);
        const params = {
          tags: {
            payerFspId,
            fxpId
          },
          headers: replaceHeaders({
            'Accept': 'application/vnd.interoperability.fxQuotes+json;version=2.0',
            'Content-Type': 'application/vnd.interoperability.fxQuotes+json;version=2.0',
            'FSPIOP-Source': payerFspId,
            'FSPIOP-Destination': fxpId,
            'Date': (new Date()).toUTCString(),
            'traceparent': traceParent.toString(),
            'tracestate': `tx_end2end_start_ts=${startTsFxQuotes}`
          }),
        };

        const msgId = ulid();
        const body = __ENV.API_TYPE === 'iso20022' ? {
          GrpHdr: {
            MsgId: msgId,
            CreDtTm: new Date().toISOString(),
            NbOfTxs: '1',
            SttlmInf: {
              SttlmMtd: 'CLRG'
            },
            PmtInstrXpryDtTm: '2030-01-01T00:00:00.000Z'
          },
          CdtTrfTxInf: {
            PmtId: {
              TxId: conversionRequestId,
              InstrId: transactionId,
              EndToEndId: transactionId
            },
            Dbtr: {
              FinInstnId: {
                Othr: {
                  Id: payerFspId
                }
              }
            },
            UndrlygCstmrCdtTrf: {
              Dbtr: {
                Id: {
                  OrgId: {
                    Othr: {
                      Id: payerFspId
                    }
                  }
                }
              },
              DbtrAgt: {
                FinInstnId: {
                  Othr: {
                    Id: payerFspId
                  }
                }
              },
              Cdtr: {
                Id: {
                  OrgId: {
                    Othr: {
                      Id: fxpId
                    }
                  }
                }
              },
              CdtrAgt: {
                FinInstnId: {
                  Othr: {
                    Id: fxpId
                  }
                }
              },
              InstdAmt: {
                Ccy: currency,
                ActiveOrHistoricCurrencyAndAmount: `${amount}`
              }
            },
            Cdtr: {
              FinInstnId: {
                Othr: {
                  Id: fxpId
                }
              }
            },
            IntrBkSttlmAmt: {
              Ccy: targetCurrency,
              ActiveCurrencyAndAmount: '0'
            },
            InstrForCdtrAgt: {
              InstrInf: 'SEND'
            }
          }
        } : {
          "conversionRequestId": conversionRequestId,
          "conversionTerms": {
            "conversionId": conversionId,
            "initiatingFsp" : payerFspId,
            "determiningTransferId": transactionId,
            "counterPartyFsp": fxpId,
            "amountType": "SEND",
            "expiration": "2030-01-01T00:00:00.000Z",
            "sourceAmount": {
              "amount": `${amount}`,
              "currency": `${currency}`
            },
            "targetAmount": {
              "currency": `${targetCurrency}`
            }
          }
        };

        // Lets send the FSPIOP POST /quotes request
        const res = http.post(`${__ENV.K6_SCRIPT_FSPIOP_QUOTES_ENDPOINT_URL}/fxQuotes`, JSON.stringify(body), params);
        check(res, { 'FXQUOTES_FSPIOP_POST_FXQUOTES_RESPONSE_IS_202' : (r) => r.status == 202 });

        wsTimeoutId = setTimeout(() => {
          const errorMsg = `WS timed-out on URL: ${wsURLFxQuotes}`
          console.error(traceId, errorMsg);
          check(res, { 'FXQUOTES_E2E_FSPIOP_POST_FXQUOTES_SUCCESS': (cbMessage) => false });
          wsFxQuotes.close();
        }, wsTimeoutMs);
      };
    };

    wsParties.onopen = () => {
      __ENV.K6_DEBUG && console.info(traceId, `WS open on URL: ${wsURLParties}`);
      const params = {
        tags: {
          payerFspId,
          payeeFspId
        },
        headers: replaceHeaders({
          'Accept': 'application/vnd.interoperability.parties+json;version=1.1',
          'Content-Type': 'application/vnd.interoperability.parties+json;version=1.1',
          'FSPIOP-Source': payerFspId,
          'Date': (new Date()).toUTCString(),
          'traceparent': traceParent.toString(),
          'tracestate': `tx_end2end_start_ts=${startTsParties}`
        }),
      };

      const res = http.get(`${__ENV.K6_SCRIPT_FSPIOP_ALS_ENDPOINT_URL}/parties/${idType}/${payeeId}`, params);
      check(res, { 'ALS_FSPIOP_GET_PARTIES_RESPONSE_IS_202' : (r) => r.status == 202 });

      wsTimeoutId = setTimeout(() => {
        const errorMsg = `WS timed-out on URL: ${wsURLParties}`
        console.error(traceId, errorMsg);
        check(res, { 'ALS_E2E_FSPIOP_GET_PARTIES_SUCCESS': (cbMessage) => false });
        wsParties.close();
      }, wsTimeoutMs);
    };
  });
}
