import {Component} from 'react';
export default class ChartBoundary extends Component{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 render(){return this.state.failed?<div className="chart-box chart-load-error" role="alert"><p>图表组件暂时无法加载，请刷新页面重试。</p><button className="secondary-button" onClick={()=>location.reload()}>刷新图表</button></div>:this.props.children;}
}
