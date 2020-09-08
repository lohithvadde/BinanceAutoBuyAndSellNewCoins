/*
NOTE: 
Always maintain BNB balance in Binance wallet, otherwise Binance will charge 0.1% percent commission from the bought assets (coins).
This will lead to reduction in coin quantity. So, you can't sell the quantity which the system computed based on your balance & coin price.
You will get into LOT_SIZE or Insufficient balance or MIN_NOTION issues.
*/
const $ = require('jquery');
const api = require('binance');
const XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;

let fiat_currency = ''; // Trade with this currency

let global_coins = {}; // Used to identify new coins
const global_coinpairs_prices = {}; // Used to track Binance coinpair & prices
let new_coin = '';
const global_timer = 100; // Check https://api.binance.com/api/v3/exchangeInfo for Rate limitation
let global_markup = ''; // Used for UI rendering
let global_buy_precision;
let global_isTradable = 0;
let global_cmcapikey = '';

const sell_coin = {
  "eflag": false,
  "coin": "",
  "coinprice": "",
  "quantity": "",
};

let global_peak, global_low;
const global_coinmcap = {};


// If explicit coin trading, autobuying new pairs will be disabled by default.
$(document).ready(function () {
    $("#coin").change(function () {
      const textVal = $('#coin').val();
      if (textVal.match(/\S/)) {
            //Timeout to help in debugging and exiting the trades done by mistake
            setTimeout(deleteSymbol, 60 * 1000);

            function deleteSymbol() {
                delete global_coins[$('#coin').val()];
            }
        }
    });
});


// Exit the trade ondemand.
$(document).ready(function () {
    $("#exitTradeNow").click(function () {
        exitTradeNowFunc();
    });
});


// Get all coin symbols onload
const binanceRequest = new XMLHttpRequest();
binanceRequest.open('GET', 'https://api.binance.com/api/v3/ticker/price', true);
binanceRequest.onload = function () {
  const local_symbol = {};
  binanceResponse = JSON.parse(binanceRequest.responseText);
    for (k = 0; k < binanceResponse.length; k++) {
        //Update Symbol Pairs
        global_coinpairs_prices[binanceResponse[k]["symbol"]] = binanceResponse[k]["price"];

        //Logic to retrieve coins out of Binance coin pairs
      const temp_coin_based = binanceResponse[k]["symbol"].substr(binanceResponse[k]["symbol"].length - 4, binanceResponse[k]["symbol"].length);
      if (temp_coin_based === 'USDT' || temp_coin_based === 'BKRW' || temp_coin_based === 'BUSD' || temp_coin_based === 'TUSD' ||
            temp_coin_based === 'USDC' || temp_coin_based === 'BIDR' || temp_coin_based === 'IDRT') {
            //Eg: BTC/USDT, XTZ/BUSD, ETH/TUSD
            if (!local_symbol[binanceResponse[k]["symbol"].substr(0, binanceResponse[k]["symbol"].length - 4)]) {
                local_symbol[binanceResponse[k]["symbol"].substr(0, binanceResponse[k]["symbol"].length - 4)] = '1';
            }
        } else {
            if (!local_symbol[binanceResponse[k]["symbol"].substr(0, binanceResponse[k]["symbol"].length - 3)]) {
                //Eg: AE/ETH, SUSHI/BNB, YFI/BTC
                local_symbol[binanceResponse[k]["symbol"].substr(0, binanceResponse[k]["symbol"].length - 3)] = '1';
            }
        }
    }
    global_coins = local_symbol;
}
binanceRequest.send();


//Get all the ranks from CoinMarketCap
getCoinMarketCapDetails();

$(document).ready(function () {
    $("#cmcapikey").change(function () {
        global_cmcapikey = $('#cmcapikey').val();
    });
});

function getCoinMarketCapDetails() {
    if (global_cmcapikey.match(/\S/)) {
      const cmcRequest = new XMLHttpRequest();
      cmcRequest.open('GET', "https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest?CMC_PRO_API_KEY=" + global_cmcapikey + "&limit=2000", true);
        cmcRequest.onload = function () {
            ourDatac = JSON.parse(cmcRequest.responseText);
            for (y = 0; y < ourDatac.data.length; y++) {
                global_coinmcap[ourDatac.data[y]["symbol"]] = ourDatac.data[y]["cmc_rank"];
            }
        }
        cmcRequest.send();

    } else {
        // RECURSION. Exits when CMC details captured.
        setTimeout(getCoinMarketCapDetails, global_timer);
    }
}


//Main Logic
mainLogic();

/*
USE CASES for mainLogic function
1. New coin not found
2. New coin found but not tradable
3. New coin found and tradable
*/

function mainLogic() {
    fiat_currency = $('#fiatfrom option:selected').val();

    if (new_coin.length > 0 && $('#tradeon').is(':checked')) {
        checkIfTradable();
        if (global_isTradable) {
            // If it's tradable, buy it & set the sell_coin[eflag] to true
            executeBuyTrade(); // setting the new_coin to void in executeBuyTrade
        } else if (Object.keys(global_coins).length > 0) {
            // If it's not tradable, not adding the new coin to global_coins
            getAllSymbols();
        } else {
            console.log("something fishy");
        }
    } else if (Object.keys(global_coins).length > 0) {
        getAllSymbols();
    } else {
        console.log("something fishy");
    }

    if (sell_coin["eflag"] === true) {
        executeSellTrade();
        refreshWidget();
    }
    // RECURSION. Exits when trialing stop triggers or Forced Exit.
    setTimeout(mainLogic, global_timer);
}


function getAllSymbols() {
  const ourRequest1 = new XMLHttpRequest();
  ourRequest1.open('GET', 'https://api.binance.com/api/v3/ticker/price', true);
    ourRequest1.onload = function () {
        ourDatax = JSON.parse(ourRequest1.responseText);
        for (k = 0; k < ourDatax.length; k++) {

            //Update coinpairs & prices as in a recursion.
            global_coinpairs_prices[ourDatax[k]["symbol"]] = ourDatax[k]["price"];

            //Trading with fiat based assets USDT & BUSD. Tweek this to work with other assets.
            if (ourDatax[k]["symbol"].substr(ourDatax[k]["symbol"].length - 4, ourDatax[k]["symbol"].length) === fiat_currency) {

                if (!global_coins[ourDatax[k]["symbol"].substr(0, ourDatax[k]["symbol"].length - 4)]) {

                    if (!(new_coin.length > 0)) {

                        //Check the ranking before updating new coin:-
                      const local_rank = parseInt(global_coinmcap[ourDatax[k]["symbol"].substr(0, ourDatax[k]["symbol"].length - 4)]);
                      let local_shouldbuy = false;

                      if ($('#crank').is(':checked')) {
                            if ($('#skipim').is(':checked')) {
                                if (!local_rank) {
                                    local_shouldbuy = true;
                                } else if (local_rank <= parseInt($('#crankval').val())) {
                                    local_shouldbuy = true;
                                }
                            } else {
                                if (local_rank && (local_rank <= parseInt($('#crankval').val()))) {
                                    local_shouldbuy = true;
                                }
                            }
                        } else {
                            local_shouldbuy = true;
                        }

                        if (local_shouldbuy) {
                            // Identified new coin
                            new_coin = ourDatax[k]["symbol"].substr(0, ourDatax[k]["symbol"].length - 4);
                            break;
                        }
                    }
                }
            }
            /* else {

               if (!global_coins[ourDatax[k]["symbol"].substr(0, ourDatax[k]["symbol"].length - 3)]) {
                 global_coins[ourDatax[k]["symbol"].substr(0, ourDatax[k]["symbol"].length - 3)] = '1';
                 if (!(new_coin.length > 0)) {
                   //Check the ranking before updating new coin:- 
                   var local_rank = parseInt(global_coinmcap[ourDatax[k]["symbol"].substr(0, ourDatax[k]["symbol"].length - 3)]);
                   var local_shouldbuy = false;
                   if ($('#crank').is(':checked')) {
                     if ($('#skipim').is(':checked')) {
                       if (!local_rank) {
                         local_shouldbuy = true;
                       } else if (local_rank <= parseInt($('#crankval').val())) {
                         local_shouldbuy = true;
                       }
                     } else {
                       if (local_rank && (local_rank <= parseInt($('#crankval').val()))) {
                         local_shouldbuy = true;
                       }
                     }
                   } else {
                     local_shouldbuy = true;
                   }

                   if (local_shouldbuy) {
                     new_coin = ourDatax[k]["symbol"].substr(0, ourDatax[k]["symbol"].length - 3);
                   }
                 }
               }
             } */
        }
    }
    ourRequest1.send();
}

function checkIfTradable() {
  const exchangeInfoRequest = new XMLHttpRequest();
  exchangeInfoRequest.open('GET', 'https://api.binance.com/api/v3/exchangeInfo', true);
    exchangeInfoRequest.onload = function () {
        exchangeInfoResponse = JSON.parse(exchangeInfoRequest.responseText);
        for (x = 1; x < exchangeInfoResponse["symbols"].length; x++) {
            if (exchangeInfoResponse["symbols"][x]["symbol"] === new_coin + fiat_currency) {
                if (exchangeInfoResponse["symbols"][x]["status"] === "TRADING") {
                    // Add new coin to the global coins map only after its tradable.
                    global_isTradable = 1;
                    global_coins[new_coin] = '1';
                    break;
                }
            }
        }
    }
    exchangeInfoRequest.send();
}


function executeBuyTrade() {

  const local_new_coin = new_coin;
  new_coin = ''; // Set this to empty too trade the next new coin
  let local_fiat_existing_bal, local_fiat_bal_after_order, local_quantity;


  if ($('#fiatfrom option:selected').val() === fiat_currency) {

        const binanceRest1 = new api.BinanceRest({
            key: $('#apikey').val() + "", // Get this from your account on binance.com
            secret: $('#seckey').val() + "", // Same for this
            timeout: 15000, // Optional, defaults to 15000, is the request time out in milliseconds
            recvWindow: 10000, // Optional, defaults to 5000, increase if you're getting timestamp errors
            disableBeautification: false,
            handleDrift: true
        });

        binanceRest1.account()
            .then((accountInfo1) => {
                for (l = 0; l < accountInfo1["balances"].length; l++) {
                    if (accountInfo1["balances"][l]["asset"] === fiat_currency) {
                        local_fiat_existing_bal = parseFloat(accountInfo1["balances"][l]["free"]);
                        break;
                    }
                }
                //Get Precision
                return binanceRest1.exchangeInfo();
            })
            .then((exchangeInfoResponse) => {
                //Calculate precision
                for (x = 1; x < exchangeInfoResponse["symbols"].length; x++) {
                    if (exchangeInfoResponse["symbols"][x]["symbol"] === local_new_coin + fiat_currency) {
                        global_buy_precision = parseInt(decimalPlaces(parseFloat(exchangeInfoResponse["symbols"][x]["filters"][2]["stepSize"])));
                        break;
                    }
                }

              const local_coin_price = parseFloat(global_coinpairs_prices[local_new_coin + fiat_currency]);
              const local_quantity_buy = parseFloat($('#famount').val() / local_coin_price);
              const local_exp = 10 ** global_buy_precision;

              local_quantity = (Math.floor(local_exp * local_quantity_buy) / local_exp).toFixed(global_buy_precision);

                return binanceRest1.newOrder({
                    symbol: local_new_coin + fiat_currency,
                    side: 'BUY',
                    type: 'MARKET',
                    quantity: local_quantity,
                    newOrderRespType: 'FULL',
                });
            })
            .then((orderResponse) => {
                console.log(orderResponse);
                return binanceRest1.account();
            })
            .then((accountInfo2) => {
                for (n = 0; n < accountInfo2["balances"].length; n++) {
                    if (accountInfo2["balances"][n]["asset"] === fiat_currency) {
                        local_fiat_bal_after_order = parseFloat(accountInfo2["balances"][n]["free"]);
                        break;
                    }
                }
                console.log("Remaining balance in account" + (local_fiat_existing_bal - local_fiat_bal_after_order) + " " + fiat_currency)

                sell_coin["eflag"] = true;
                sell_coin["coin"] = local_new_coin;
                sell_coin["coinprice"] = parseFloat(global_coinpairs_prices[sell_coin["coin"] + fiat_currency]);

                global_peak = sell_coin["coinprice"];
                global_low = parseFloat((100 - parseFloat($('#tstop').val())) * global_peak / 100);

                /*
                //Binance charges 0.1% fee on both market makers & takers. so get the real quantity after buying new coin inorder to sell.
                //Make sure to comply with https://github.com/binance-exchange/binance-official-api-docs/blob/master/rest-api.md#lot_size
                local_quantity = local_quantity - ((local_quantity/100)*0.1);
                console.log("selling "+local_quantity+ " "+ local_new_coin + " coins");
                */
                sell_coin["quantity"] = local_quantity;

                global_markup = $('#famount').val() + "(" + fiat_currency + ") ->" + sell_coin["quantity"] + "(" + sell_coin["coin"] + ") -> ";
                $('#status3').html(global_markup);

                document.getElementById("exitTradeNow").disabled = false;

                //Disable input fields
                document.getElementById("famount").disabled = true;
                document.getElementById("asell").disabled = true;
                document.getElementById("tstop").disabled = true;
                document.getElementById("crank").disabled = true;
                document.getElementById("crankval").disabled = true;

            })
            .catch((err) => {
                console.error(err);
            });

    }

}


function executeSellTrade() {
    //Check Trailing Stop Condition is met.
  const local_current_price = parseFloat(global_coinpairs_prices[sell_coin["coin"] + fiat_currency]);
  if (local_current_price > global_peak) {
        global_peak = local_current_price;
        global_low = parseFloat((100 - parseFloat($('#tstop').val())) * global_peak / 100);
    } else if (local_current_price < global_low) { //Is price less than trailing stop
        //Sell Off
        exitTradeNowFunc();
    }
}


function refreshWidget() {
  const local_current_price = parseFloat(global_coinpairs_prices[sell_coin["coin"] + fiat_currency]);
  const local_current_value = parseFloat(parseFloat(sell_coin["quantity"]) * local_current_price).toFixed(2);

  const local_change = parseFloat((local_current_value - parseFloat($('#famount').val())) * 100 / parseFloat($('#famount').val())).toFixed(2);

  $('#status5').html(parseFloat(global_coinpairs_prices[sell_coin["coin"] + fiat_currency]) + '$');
    $('#status1').html(local_current_value + '$');
    $('#status2').html(local_change + '%');

    if (local_change > 0) {
        $('#status4').removeClass("text-danger");
        $('#status4').addClass("text-success");
    } else {
        $('#status4').removeClass("text-success");
        $('#status4').addClass("text-danger");
    }

}

function exitTradeNowFunc() {
    sell_coin["eflag"] = false;
  let local_fiat_existing_bal, local_fiatbal2, local_fiatbal, local_quantity;

  const binanceRest1 = new api.BinanceRest({
        key: $('#apikey').val() + "", // Get this from your account on binance.com
        secret: $('#seckey').val() + "", // Same for this
        timeout: 15000, // Optional, defaults to 15000, is the request time out in milliseconds
        recvWindow: 10000, // Optional, defaults to 5000, increase if you're getting timestamp errors
        disableBeautification: false,
        handleDrift: true
    });


    binanceRest1.account()
        .then((accountInfo1) => {
            for (l = 0; l < accountInfo1["balances"].length; l++) {
                if (accountInfo1["balances"][l]["asset"] === fiat_currency) {
                    local_fiat_existing_bal = parseFloat(accountInfo1["balances"][l]["free"]);
                    break;
                }
            }

            return binanceRest1.newOrder({
                symbol: sell_coin["coin"] + fiat_currency,
                side: 'SELL',
                type: 'MARKET',
                quantity: parseFloat(sell_coin["quantity"]),
                newOrderRespType: 'FULL',
            });
        })
        .then((orderResponse) => {
            console.log(orderResponse);
            return binanceRest1.account();
        })
        .then((accountInfo2) => {

            for (n = 0; n < accountInfo2["balances"].length; n++) {
                if (accountInfo2["balances"][n]["asset"] === fiat_currency) {
                    local_fiat_bal_after_order = parseFloat(accountInfo2["balances"][n]["free"]);
                    break;
                }
            }

            console.log("Current balance in account is " + local_fiat_bal_after_order + " " + fiat_currency)

            global_markup += (local_fiat_bal_after_order - local_fiat_existing_bal) + fiat_currency;
            $('#status3').html(global_markup);
        })
        .catch((err) => {
            console.error(err);
        });

}

function decimalPlaces(num) {
  const match = ('' + num).match(/(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);
  if (!match) {
        return 0;
    }
    return Math.max(
        0,
        // Number of digits right of decimal point.
        (match[1] ? match[1].length : 0)
        // Adjust for scientific notation.
        -
        (match[2] ? +match[2] : 0));
}