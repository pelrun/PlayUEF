// Additional support for TZX/CDT tape format
// used on ZX Spectrum and Amstrad CPC series machines
// 2018 James Churchill <pelrun@gmail.com>
//
// https://www.worldofspectrum.org/TZXformat.html
//

function tzx2wave (tzxData, sampleRate) {
  "use strict";

  const CLOCK_RATE = 3500000;

  const defaultParams = {
    pilot_length:        2168,
    pilot_count:         8063, //3223
    sync_length1:        667,
    sync_length2:        735,
    bit0_length:         855,
    bit1_length:         1710,
    lastbytelength:      8,
  }

  const gain = 0x7000;

  var isValidTZX = function() {return ((String.fromCharCode.apply(null,tzxData.slice(0, 7)) == "ZXTape!"));}

  // check if the UEF is in fact zipped
  if (isValidTZX()==false) {
    try{
      var gunzip = new Zlib.Gunzip(tzxData);
      tzxData = gunzip.decompress();
    }
    catch(e) {handleError("Invalid TZX/ZIP file<BR>",e);}
  }

  if (isValidTZX()==false) {handleError("Invalid TZX file",0);}

  var tzxChunks      = [];
  var cyclesPerSample = Math.floor(CLOCK_RATE / sampleRate); // Audio samples per clock cycle
  var tzxPos         = 10; // skip over tzx header
  var tzxDataLength  = tzxData.length;
  var tzxCycles      = 0;
  var currentLevel   = -1;
  var amstradHeader  = "";

  function decodeTZX(tzxData){

    function decodeAmstradHeader(data) {
      let type = "";
      if (data[0] == 0x2C && data.length == 263) {
        switch (data[19]&0xF) {
          case 0:
            type=" BASIC";
            break;
          case 1:
            type=" Protected BASIC";
            break;
          case 2:
            type=" Binary load:"+hex4(wordAt(data, 22))+" exec:"+hex4(wordAt(data, 27));
            break;
          case 6:
            type=" ASCII";
            break;
        }

        amstradHeader = String.fromCharCode.apply(null,data.slice(1,15))+" block "+data[17]+type;
        return true;
      }
      return false;
    }

    function toSamples(cycles) {
      return Math.floor(0.5 + cycles/cyclesPerSample);
    }

    function makePulseArray(length1, length2) {
      var low  = Array(toSamples(length1)).fill(-1*currentLevel*gain);
      var high = Array(toSamples(length2)).fill(+1*currentLevel*gain);
      return [...low, ...high];
    }

    function addTone(length, count) {
      var chunk = {type:"tone", length:length, count:count};

      var low  = Array(toSamples(length)-1).fill(-1*currentLevel*gain);
      var high = Array(toSamples(length)-1).fill(+1*currentLevel*gain);

      var samples = [];
      for (var i=0; i<count; i++) {
        if (i&1)
        samples.push(...high);
        else
        samples.push(...low);
      }
      if (count&1) currentLevel = -1*currentLevel;

      chunk.samples = new Int16Array(samples);

      tzxChunks.push(chunk);
    }

    function addSync(length1, length2) {
      var chunk = {type:"sync", length1:length1, length2:length2};

      chunk.samples = new Int16Array(makePulseArray(length1, length2));

      //console.log("sync length:",chunk.samples.length/sampleRate);
      tzxChunks.push(chunk);
    }

    function countBits(byte)
    {
      var count = 0;
      while (byte) {
        byte &= byte -1;
        count++;
      }
      return count;
    }

    function addData(bit0, bit1, data, lastbytelen) {
      var chunk = {type:"data", bit0:bit0, bit1:bit1, data:data, lastbytelen: lastbytelen};

      //console.log("data bit0:"+bit0+" bit1:"+bit1+" length:"+(data.length+18)+" lastbytelen:"+lastbytelen);

      var bit0array = makePulseArray(bit0,bit0);
      var bit1array = makePulseArray(bit1,bit1);

      var samples = [];

      for (var i = 0; i < data.length-1; i++) {
        for (var b = 7; b >= 0; b-- ) {
          (data[i] & (1<<b)) ? samples.push(...bit1array) : samples.push(...bit0array);
        }
      }
      for (var b = 7; b >= 8-lastbytelen; b--) {
        (data[data.length-1] & (1<<b)) ? samples.push(...bit1array) : samples.push(...bit0array);
      }

      chunk.samples = new Int16Array(samples);

      // decode amstrad tape header and attach to subsequent block
      let is_ams_header = decodeAmstradHeader(data);
      chunk.header = amstradHeader;
      if (!is_ams_header) {
        amstradHeader = '';
      }

      //console.log("data length:",chunk.samples.length/sampleRate);
      tzxChunks.push(chunk);
    }

    function addPause(ms) {
      var chunk = {type:"pause", ms:ms};
      var one_ms = sampleRate / 1000;
      chunk.samples = Array(Math.floor(ms * one_ms)).fill(gain).fill(-1*gain,0,one_ms);
      currentLevel = -1;

      //console.log("pause length:",chunk.samples.length/sampleRate);
      tzxChunks.push(chunk);
    }

    function decodeNextChunk(tzxData, pos) {

      var chunkLen = 1;
      var chunkId = tzxData[pos++];

      switch (chunkId){

        case 0x10: // standard block
        {
          // FIXME: pilot count differs for header/data on spectrum
          let chunk = {
            pause: wordAt(tzxData,pos+0x0),
            data_length: wordAt(tzxData,pos+0x2),
            data_start: pos+0x4,
          };
          addTone(defaultParams.pilot_length, defaultParams.pilot_count);
          addSync(defaultParams.sync_length1, defaultParams.sync_length2);
          addData(defaultParams.bit0_length, defaultParams.bit1_length, tzxData.slice(chunk.data_start, chunk.data_start+chunk.data_length), 8);
          addPause(chunk.pause);
          chunkLen += chunk.data_length + 4;
        }
        break;

        case 0x11: // turbo block
        {
          let chunk = {
            pilot_length: wordAt(tzxData,pos+0),
            sync_length1: wordAt(tzxData,pos+2),
            sync_length2: wordAt(tzxData,pos+4),
            bit0_length: wordAt(tzxData,pos+6),
            bit1_length: wordAt(tzxData,pos+8),
            pilot_count: wordAt(tzxData,pos+0xA),
            lastbytelength: tzxData[pos+0xC],
            pause: wordAt(tzxData,pos+0xD),
            data_length: tripleAt(tzxData,pos+0xF),
            data_start: pos+0x12,
          };
          addTone(chunk.pilot_length, chunk.pilot_count);
          addSync(chunk.sync_length1, chunk.sync_length2);
          addData(chunk.bit0_length, chunk.bit1_length, tzxData.slice(chunk.data_start, chunk.data_start+chunk.data_length), chunk.lastbytelength);
          addPause(chunk.pause);
          chunkLen += chunk.data_length + 0x12;
        }
        break;

        case 0x12: // pure tone
        {
          let chunk = {
            tone_length: wordAt(tzxData,pos+0),
            tone_count: wordAt(tzxData,pos+2),
          };
          addTone(chunk.tone_length, chunk.tone_count);
          chunkLen += 4;
        }
        break;

        case 0x13: // pulse sequence
        // not implemented
        chunkLen += tzxData[pos]*2 + 1;
        break;

        case 0x14: // pure data
        {
          let chunk = {
            bit0_length: wordAt(tzxData,pos+0x0),
            bit1_length: wordAt(tzxData,pos+0x2),
            lastbytelength: tzxData[pos+0x4],
            pause: wordAt(tzxData,pos+0x5),
            data_length: tripleAt(tzxData,pos+0x6),
            data_start: pos+0xA,
          };
          addData(chunk.bit0_length, chunk.bit1_length, tzxData.slice(chunk.data_start, chunk.data_start+chunk.data_length), chunk.lastbytelength);
          addPause(chunk.pause);
          chunkLen += chunk.data_length + 0xA;
        }
        break;

        case 0x15: // direct recording
        // not implemented
        chunkLen += tripleAt(tzxData,pos+0x5) + 0x8;
        break;

        case 0x18: // CSW block
        // not implemented
        chunkLen += doubleAt(tzxData,pos+0x0) + 0x4;
        break;

        case 0x19: // Generalised data block
        // not implemented
        chunkLen += doubleAt(tzxData,pos+0x0) + 0x4;
        break;

        case 0x20: // pause block
        addPause(wordAt(tzxData,pos+0));
        chunkLen += 2;
        break;

        case 0x21: // Group start
        // not implemented
        chunkLen += tzxData[pos] + 1;
        break;

        case 0x22: // Group end
        // zero length
        break;

        case 0x23: // Jump to block
        // not implemented
        chunkLen += 2;
        break;

        case 0x24: // Loop start
        // not implemented
        chunkLen += 2;
        break;

        case 0x25: // Loop end
        // zero length
        break;

        case 0x26: // Call sequence
        // not implemented
        chunkLen += wordAt(tzxData,pos)*2 + 2;
        break;

        case 0x27: // Return from sequence
        // zero length
        break;

        case 0x28: // Select block
        // not implemented
        chunkLen += wordAt(tzxData,pos)*2 + 2;
        break;

        case 0x2A: // Stop the tape if in 48K mode
        // not implemented
        chunkLen += 4;
        break;

        case 0x2B: // Set signal level
        // not implemented
        chunkLen += 5;
        break;

        case 0x30: // Text description
        // not implemented
        chunkLen += tzxData[pos] + 1;
        break;

        case 0x31: // Message block
        // not implemented
        chunkLen += tzxData[pos+1]*2;
        break;

        case 0x32: // Archive info
        // not implemented
        chunkLen += wordAt(tzxData,pos) + 2;
        break;

        case 0x33: // Hardware type
        // not implemented
        chunkLen += tzxData[pos+1]*3 + 1;
        break;

        case 0x35: // Custom info block
        // not implemented
        chunkLen += doubleAt(tzxData,pos+0x10) + 0x14;
        break;

        case 0x5A: // "Glue" block (90 dec, ASCII Letter 'Z')
        chunkLen += 9;
        break;

        default:
        // general extension rule
        // not implemented
        chunkLen += doubleAt(tzxData,pos+0x0) + 0x4;
        break;
      }

      return chunkLen;
    }

    // Decode all UEF chunks
    var blockNumber = 0;
    while (tzxPos < tzxDataLength) {
      tzxPos += decodeNextChunk(tzxData, tzxPos);
    }
    return tzxChunks;
  }


  function createWAV (chunks) {

    var tzxSamples = 0
    var numChunks = tzxChunks.length;

    for (var i = 0; i < numChunks; i++) {
      if (tzxChunks[i].samples != null) {
        tzxChunks[i].sampleLength = tzxChunks[i].samples.length;
        tzxSamples += tzxChunks[i].sampleLength;
      }
    }

    var waveBuffer    = new ArrayBuffer(44 + tzxSamples*2); // Header is 44 bytes, sample is 16-bit * sampleLength
    var sampleData    = new Int16Array(waveBuffer, 44, tzxSamples);
    var samplePos     = 0;
    var re = /[^\x20-\x7e]/g;
    // Parse all chunk objects and write WAV
    for (var i = 0; i < numChunks; i++) {
      let chunk = tzxChunks[i];
      chunk.timestamp = samplePos; // Record start position in audio WAV, given in samples
      sampleData.set(chunk.samples,samplePos);
      samplePos += chunk.samples.length;

      // Array to string for console display
      if (chunk.data != null){
        var str = String.fromCharCode.apply(null,chunk.data);//
        chunk.datastr = str.replace(/[<>]/g, '.').replace(re, ".").replace(/&/g,'&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      }

    }

    console.log(Math.floor(tzxSamples/sampleRate)+"s WAV audio");
    return new Uint8Array(buildWAVheader(waveBuffer, samplePos, sampleRate));
  }

  console.time('Decode TZX');
  var tzxChunks = decodeTZX(tzxData);
  console.timeEnd('Decode TZX');
  console.time('Create WAV');
  var wavfile = createWAV(tzxChunks);
  console.timeEnd('Create WAV');
  return {wav:wavfile, uef:tzxChunks};
};
