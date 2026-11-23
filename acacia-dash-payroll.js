/* Acacia Payroll — dashboard rebuilt to the suite design. Loaded after script.js; replaces viewDashboard(). */
(function(){
  var D = window.AcxDash, E = D.esc;
  function runs(){ return (state.payRuns||[]).slice().sort(function(a,b){ return String(a.payDate||'').localeCompare(String(b.payDate||'')) || (a.createdAt-b.createdAt); }); }
  function ded(r){ return (r.totals.gross||0) - (r.totals.net||0); }
  function sum(rs, f){ return rs.reduce(function(s,r){ return s + (f(r)||0); }, 0); }
  function statusCls(s){ return s==='Paid'?'g':(s==='Approved'||s==='Posted')?'b':'o'; }
  function statusTxt(s){ return s==='Paid'?'Completed':s; }

  window.viewDashboard = function(){
    var per = D.getPeriod('payroll','month'); if(['month','quarter','year'].indexOf(per)<0) per='month';
    var cur = D.range(per,0), prv = D.range(per,1), all = runs();
    var inCur = all.filter(function(r){ return D.within(r.payDate, cur); });
    var inPrv = all.filter(function(r){ return D.within(r.payDate, prv); });
    var emps = state.employees||[], active = emps.filter(function(e){return e.status==='Active';});
    var inactive = emps.length - active.length;
    var today = D.iso(new Date());
    var leaveToday = {}; (state.attendance||[]).forEach(function(r){ if(String(r.date).slice(0,10)===today && /leave/i.test(r.type||'')) leaveToday[r.empId]=1; });
    var onLeave = active.filter(function(e){ return leaveToday[e.id]; }).length;
    var working = active.length - onLeave;

    var gross = sum(inCur,function(r){return r.totals.gross;}), net = sum(inCur,function(r){return r.totals.net;}), dd = sum(inCur,ded);
    var pg = sum(inPrv,function(r){return r.totals.gross;}), pn = sum(inPrv,function(r){return r.totals.net;}), pd = sum(inPrv,ded);
    var vs = 'vs last ' + (per==='month'?'month':per==='quarter'?'quarter':'year');

    var trend = all.slice(-6);
    var bars = trend.length ? D.bars(trend.map(function(r){return String(r.period).split(' ')[0].slice(0,3);}),
        [{name:'Net Salary',color:'#1b7a2f',values:trend.map(function(r){return r.totals.net;})},{name:'Deductions',color:'#3b82f6',values:trend.map(ded)}],
        {stacked:true,pad:78,tipFmt:function(v){return D.money(v);}}) : '<div class="ad-empty">Run payroll to start building a trend.</div>';

    var recent = all.slice().reverse().slice(0,5).map(function(r){
      return '<div class="ad-li" style="cursor:pointer" onclick="openPayRun(\''+r.id+'\')"><span class="ad-ic" style="color:'+(r.status==='Paid'?'#1b7a2f':'#f59e0b')+'">'+D.icon(r.status==='Paid'?'check':'clock')+'</span>'
        +'<span class="n">'+E(r.period)+' Payroll – '+E(statusTxt(r.status))+'<span class="s">'+D.money(r.totals.net)+' net · '+((r.employeeIds||[]).length)+' employees</span></span><span class="m">'+E(D.dstr(r.payDate))+'</span></div>';
    }).join('') || '<div class="ad-empty">No payroll runs yet.</div>';

    var pct = active.length ? Math.round(working/active.length*100) : 0;
    var empCard = D.card('Employee Overview', D.donut([
        {l:'Active',v:active.length,c:'#1b7a2f'},{l:'On Leave',v:onLeave,c:'#3b82f6'},{l:'Inactive',v:inactive,c:'#a855f7'}
      ],{center:pct+'%',sub:'at work today'}), {icon:'users'});

    var kp = [
      D.kpi({icon:'users',color:'green',label:'Total Employees',value:D.num(active.length)}),
      D.kpi({icon:'wallet',color:'blue',label:per==='month'?'Monthly Payroll':'Gross Payroll',value:D.money(gross),delta:D.delta(gross,pg,vs)}),
      D.kpi({icon:'layers',color:'green',label:'Net Salaries',value:D.money(net),delta:D.delta(net,pn,vs)}),
      D.kpi({icon:'file',color:'purple',label:'Deductions',value:D.money(dd),delta:D.delta(dd,pd,vs)})
    ].join('');

    var actions = D.qa('Payroll Actions',[
      {icon:'play',label:'Run Payroll',on:"goTo('runpayroll')"},
      {icon:'file',label:'View Payslips',on:"goTo('payslips')"},
      {icon:'shield',label:'Tax Summary',on:"goTo('taxes')"},
      {icon:'bar',label:'Reports',on:"goTo('reports')"},
      {icon:'plus',label:'Add Employee',on:"openEmployeeModal()"}
    ]);

    return '<div class="ad">'
      + D.head({icon:'bar',title:'Payroll Dashboard',sub:'Manage People. Pay with Confidence.',right:D.periodSelect('payroll',per,['month','quarter','year'])})
      + '<div class="ad-kpis">'+kp+'</div>'
      + '<div class="ad-row ad-r-21">'
        + D.card('Payroll Trend', bars, {icon:'bar',right:D.keys([{l:'Net Salary',c:'#1b7a2f'},{l:'Deductions',c:'#3b82f6'}])})
        + actions
      + '</div>'
      + '<div class="ad-row ad-r-2">'
        + D.card('Recent Payrolls', '<div class="ad-list">'+recent+'</div>', {icon:'receipt',right:'<button class="ad-link" onclick="goTo(\'payruns\')">View all</button>'})
        + empCard
      + '</div></div>';
  };
  D.onPeriod('payroll', function(){ if(typeof renderAll==='function' && ui.view==='dashboard') renderAll(); });
  function tag(){ D.polishTopbar('Manage People. Pay with Confidence.', '#topbar'); }
  tag(); document.addEventListener('DOMContentLoaded', tag);
  try{ if(typeof CURRENT_USER!=='undefined' && CURRENT_USER && document.getElementById('view')) renderAll(); }catch(e){}
})();
