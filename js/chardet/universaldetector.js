!function(jschardet) {

jschardet.UniversalDetector = function() {
    var MINIMUM_THRESHOLD = 0.20;
    var _state = {
        pureAscii   : 0,
        escAscii    : 1,
        highbyte    : 2
    };
    var self = this;
    
    function init() {
        self._highBitDetector = /[\x80-\xFF]/;
        self._escDetector = /(\x1B|~\{)/;
        self._mEscCharsetProber = null;
        self._mCharsetProbers = [];
        self.reset();
    }
    
    this.reset = function() {
        this.result = {"encoding": null, "confidence": 0.0};
        this.done = false;
        this._mStart = true;
        this._mGotData = false;
        this._mInputState = _state.pureAscii;
        this._mLastChar = "";
        this._mBOM = "";
        if(this._mEscCharsetProber) {
            this._mEscCharsetProber.reset();
        }
        for( var i = 0, prober; prober = this._mCharsetProbers[i]; i++ ) {
            prober.reset();
        }
    }
    
    this.feed = function(aBuf) {
        if( this.done ) return;
        
        var aLen = aBuf.length;
        if( !aLen ) return;
        
        if( !this._mGotData ) {
            this._mBOM += aBuf;
            // If the data starts with BOM, we know it is UTF
            if( this._mBOM.slice(0,3) == "\xEF\xBB\xBF" ) {
                // EF BB BF  UTF-8 with BOM
                this.result = {"encoding": "UTF-8", "confidence": 1.0};
            } else if( this._mBOM.slice(0,4) == "\xFF\xFE\x00\x00" ) {
                // FF FE 00 00  UTF-32, little-endian BOM
                this.result = {"encoding": "UTF-32LE", "confidence": 1.0};
            } else if( this._mBOM.slice(0,4) == "\x00\x00\xFE\xFF" ) {
                // 00 00 FE FF  UTF-32, big-endian BOM
                this.result = {"encoding": "UTF-32BE", "confidence": 1.0};
            } else if( this._mBOM.slice(0,4) == "\xFE\xFF\x00\x00" ) {
                // FE FF 00 00  UCS-4, unusual octet order BOM (3412)
                this.result = {"encoding": "X-ISO-10646-UCS-4-3412", "confidence": 1.0};
            } else if( this._mBOM.slice(0,4) == "\x00\x00\xFF\xFE" ) {
                // 00 00 FF FE  UCS-4, unusual octet order BOM (2143)
                this.result = {"encoding": "X-ISO-10646-UCS-4-2143", "confidence": 1.0};
            } else if( this._mBOM.slice(0,2) == "\xFF\xFE" ) {
                // FF FE  UTF-16, little endian BOM
                this.result = {"encoding": "UTF-16LE", "confidence": 1.0};
            } else if( this._mBOM.slice(0,2) == "\xFE\xFF" ) {
                // FE FF  UTF-16, big endian BOM
                this.result = {"encoding": "UTF-16BE", "confidence": 1.0};
            }

            // If we got to 4 chars without being able to detect a BOM we
            // stop trying.
            if( this._mBOM.length > 3 ) {
                this._mGotData = true;
            }
        }

        if( this.result.encoding && (this.result.confidence > 0.0) ) {
            this.done = true;
            return;
        }
        
        if( this._mInputState == _state.pureAscii ) {
            if( this._highBitDetector.test(aBuf) ) {
                this._mInputState = _state.highbyte;
            } else if( this._escDetector.test(this._mLastChar + aBuf) ) {
                this._mInputState = _state.escAscii;
            }
        }
        
        this._mLastChar = aBuf.slice(-1);
        
        if( this._mInputState == _state.escAscii ) {
            if( !this._mEscCharsetProber ) {
                this._mEscCharsetProber = new jschardet.EscCharSetProber();
            }
            if( this._mEscCharsetProber.feed(aBuf) == jschardet.Constants.foundIt ) {
                this.result = {
                    "encoding": this._mEscCharsetProber.getCharsetName(),
                    "confidence": this._mEscCharsetProber.getConfidence()
                };
                this.done = true;
            }
        } else if( this._mInputState == _state.highbyte ) {
            if( this._mCharsetProbers.length == 0 ) {
                this._mCharsetProbers = [
                    new jschardet.RuGroupProber(),
                    new jschardet.Latin1Prober()
                ];
            }
//            if( this._mCharsetProbers.length == 0 ) {
//                this._mCharsetProbers = [
//                    new jschardet.MBCSGroupProber(),
//                    new jschardet.SBCSGroupProber(),
//                    new jschardet.Latin1Prober()
//                ];
//            }
            for( var i = 0, prober; prober = this._mCharsetProbers[i]; i++ ) {
                if( prober.feed(aBuf) == jschardet.Constants.foundIt ) {
                    this.result = {
                        "encoding": prober.getCharsetName(),
                        "confidence": prober.getConfidence()
                    };
                    this.done = true;
                    break;
                }
            }
        }
    }
    
    this.close = function() {
        if( this.done ) return;
        if( this._mBOM.length === 0 ) {
            if( jschardet.Constants._debug ) {
                console.log("no data received!\n");
            }
            return;
        }
        this.done = true;
        
        if( this._mInputState == _state.pureAscii ) {
            if( jschardet.Constants._debug ) {
                console.log("pure ascii")
            }
            this.result = {"encoding": "ascii", "confidence": 1.0};
            return this.result;
        }
        
        if( this._mInputState == _state.highbyte ) {
            var proberConfidence = null;
            var maxProberConfidence = 0.0;
            var maxProber = null;
            for( var i = 0, prober; prober = this._mCharsetProbers[i]; i++ ) {
                if( !prober ) continue;
                proberConfidence = prober.getConfidence();
                if( proberConfidence > maxProberConfidence ) {
                    maxProberConfidence = proberConfidence;
                    maxProber = prober;
                }
                if( jschardet.Constants._debug ) {
                    console.log(prober.getCharsetName() + " confidence " + prober.getConfidence());
                }
            }
            if( maxProber && maxProberConfidence > MINIMUM_THRESHOLD ) {
                this.result = {
                    "encoding": maxProber.getCharsetName(),
                    "confidence": maxProber.getConfidence()
                };
                return this.result;
            }
        }
        
        if( jschardet.Constants._debug ) {
            console.log("no probers hit minimum threshhold\n");
            for( var i = 0, prober; prober = this._mCharsetProbers[i]; i++ ) {
                if( !prober ) continue;
                console.log(prober.getCharsetName() + " confidence = " +
                    prober.getConfidence() + "\n");
            }
        }
    }
    
    init();
}

}((typeof process !== 'undefined' && typeof process.title !== 'undefined') ? module.parent.exports : jschardet);
