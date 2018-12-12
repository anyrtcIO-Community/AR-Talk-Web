var XMLHttp = {
    _objPool: [],
	_objInst : null,
	_queRequest: [], 
	_queStatus: 0,
	_queBlockTimeout: null, 
    
    _getInstance: function ()
    {
        for (var i = 0; i < this._objPool.length; i ++)
        {
            if (this._objPool[i].readyState == 0 || this._objPool[i].readyState == 4)
            {
                return this._objPool[i];
            }
        }
        
        // IE5�в�֧��push����
        this._objPool[this._objPool.length] = this._createObj();

        return this._objPool[this._objPool.length - 1];
    },

    _createObj: function ()
    {
        if (window.XMLHttpRequest)
        {
            var objXMLHttp = new XMLHttpRequest();

        }
        else
        {
            var MSXML = ['MSXML2.XMLHTTP.5.0', 'MSXML2.XMLHTTP.4.0', 'MSXML2.XMLHTTP.3.0', 'MSXML2.XMLHTTP', 'Microsoft.XMLHTTP'];
            for(var n = 0; n < MSXML.length; n ++)
            {
                try
                {
                    var objXMLHttp = new ActiveXObject(MSXML[n]);        
                    break;
                }
                catch(e)
                {
                }
            }
         }          
        
        // mozillaĳЩ�汾û��readyState����
        if (objXMLHttp.readyState == null)
        {
            objXMLHttp.readyState = 0;

            objXMLHttp.addEventListener("load", function ()
                {
                    objXMLHttp.readyState = 4;
                    
                    if (typeof objXMLHttp.onreadystatechange == "function")
                    {
                        objXMLHttp.onreadystatechange();
                    }
                },  false);
        }

        return objXMLHttp;
    },
    
    // ��������(����[post,get], ��ַ, ����, �ص�����)
    sendReq: function (method, url, data, callback)
    {
        var objXMLHttp = this._getInstance();

        with(objXMLHttp)
        {
            try
            {
                // ���������ֹ����
                if (url.indexOf("?") > 0)
                {
                    url += "&randnum=" + Math.random();
                }
                else
                {
                    url += "?randnum=" + Math.random();
                }

                open(method, url, true);
                
                // �趨������뷽ʽ
                setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
                send(data);
                onreadystatechange = function ()
                {                   
                    if (objXMLHttp.readyState == 4 && (objXMLHttp.status == 200 || objXMLHttp.status == 304))
                    {
                        callback(objXMLHttp);
                    }
                }
            }
            catch(e)
            {
                alert(e);
            }
        }
    },
	
	queueReq: function (method, url, data, callback)
	{
		if(this._objInst == null)
		{
			this._objInst = this._createObj();
		}
		
		var jsReq = {
			m: method,
			u: url,
			d: data
		};
		this._queRequest.push(jsReq);
		
		this.queueWork(this._queRequest[0]);
	},
	queueClear: function()
	{
		this._queRequest = [];
	},
	queueWork: function(jsReq)
	{
		var that = this;
		if(this._queStatus == 0)
		{
			this._queStatus = 1;
			var objXMLHttp = this._objInst;
			with(objXMLHttp)
			{
				try
				{
					// ���������ֹ����
					var reqUrl = jsReq.u;
					if (reqUrl.indexOf("?") > 0)
					{
						reqUrl += "&randnum=" + Math.random();
					}
					else
					{
						reqUrl += "?randnum=" + Math.random();
					}

					objXMLHttp.open(jsReq.m, reqUrl, true);
					
					// �趨������뷽ʽ
					objXMLHttp.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
					objXMLHttp.send(jsReq.d);
					objXMLHttp.onreadystatechange = function ()
					{                   
						if(objXMLHttp.readyState == 1)
						{
							if(this._queBlockTimeout == null)
							{
								this._queBlockTimeout = setTimeout(function() {
									objXMLHttp.abort();
									this._queBlockTimeout = null;
									that._queStatus = 0;
									setTimeout(function() {
										if(that._queRequest.length > 0)
										{
											that.queueWork(that._queRequest[0]);
										}	
									}, 100);
									console.log("[DBG]: _queBlockTimeout is expire!");
								}, 1500);
							}
						}
						else{
							if(this._queBlockTimeout != null)
							{
								clearTimeout(this._queBlockTimeout);
								this._queBlockTimeout = null;
							}
						}
						if (objXMLHttp.readyState == 4)
						{
							if((objXMLHttp.status == 200 || objXMLHttp.status == 304))
							{
								that._queRequest.shift();
							}
							else if(objXMLHttp.status == 403)
							{
								that._queRequest.shift();
							}
							
							that._queStatus = 0;
							setTimeout(function() {
								if(that._queRequest.length > 0)
								{
									that.queueWork(that._queRequest[0]);
								}	
							}, 100);
						}
					}
				}
				catch(e)
				{
					alert(e);
				}
			}
		}
	}
};