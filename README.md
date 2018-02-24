# PlayUEF
PlayUEF is a javascript player for UEF (Acorn Electron and BBC Micro) and TZX/CDT (ZX Spectrum/Amstrad CPC/others) format cassette games. Conversion to 44.1KHz WAV is done in the web browser.

Just connect your computer's cassette port to the headphone socket on a laptop or smartphone and you're ready to load games!

You can try a demo version of it at http://pelrun.github.io/PlayUEF/PlayUEF.html

![Cassette player](/docs/tape.gif?raw=true)

Running locally
---------------

Set up a local web server as below and navigate to http://localhost:8000/PlayUEF.html in your web browser

    $ cd PlayUEF
    $ python -m SimpleHTTPServer 8000
    Serving HTTP on 0.0.0.0 port 8000 ...

For testing purposes http://localhost:8000/test.html fetches links to the STH UEF archive.

Local conversion & WAV download
-------------------------------
Press play on the media player in the web page to play the cassette audio from the browser.

Clicking the cassette player causes PlayUEF to download the converted audio as a WAV.

Adding the `LOCAL=true` parameter to the URL causes PlayUEF to request user to select a file to convert on their local machine.

Browser compatibility
---------------------

Tested on Chrome, Safari, Firefox and Microsoft Edge browser

Known issues on some versions of IE and Android browsers (e.g. UC browser), to be fixed...

Thanks
------
Thanks to Thomas Harte for the UEF spec and Wouter Hobers for uef2wave.py, BigEd, Commie_User, DavidB, Vanekp of the [stardot forum](http://stardot.org.uk) for suggestions and Matt Godbolt for the awesome [JSbeeb](https://github.com/mattgodbolt/jsbeeb). Not forgetting Arcadian and the archive of over 1000 games at the [STH archive](http://www.stairwaytohell.com/electron/uefarchive/) which make this project come to life.
