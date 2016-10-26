/// <reference path="typings/types.d.ts" />
(function () {
    window.GITHISTORY = {};
    function addScripts(done) {
        var scripts = document.querySelectorAll('div.script');
        var scriptCount = scripts.length;
        var scriptsLoaded = 0;
        for (var counter = 0; counter < scripts.length; counter++) {
            addScriptFile(scripts[counter].innerHTML.trim(), function () {
                scriptsLoaded += 1;
                if (scriptsLoaded >= scriptCount) {
                    done();
                }
            });
        }
    }
    function addScriptFile(scriptFilePath, onload) {
        var script = document.createElement('script');
        script.setAttribute('src', scriptFilePath.replace('/\\/g', '/'));
        document.body.appendChild(script);
        script.onload = onload;
    }
    var clipboard = null;
    function initializeClipboard() {
        $('a.clipboard-link').addClass('hidden');
        // ($('.btn.clipboard') as any).tooltip({
        //     placement: 'down'
        // });
        clipboard = new Clipboard('.btn.clipboard');
        clipboard.on('success', onCopied);
    }
    function onCopied(e) {
        e.clearSelection();
        // let $ele = $(e.trigger).attr('title', 'Copied');
        // ($ele as any).tooltip('fixTitle').tooltip('show');
    }
    addScripts(function () {
        initializeClipboard();
        window.GITHISTORY.generateSVG();
        window.GITHISTORY.initializeDetailsView();
    });
})();
//# sourceMappingURL=proxy.js.map