import type { CanvasElement } from '@/components/lovart/CanvasArea';
import type { ImageBatchRecord } from './image-batch-store';

/** Write only frozen source rows and unchanged output cells; never overwrite edits made during generation. */
export function writeImageBatchOutputs(elements:CanvasElement[],batch:ImageBatchRecord):CanvasElement[]{
  const table=elements.find(item=>item.id===batch.generatorId && item.type==='table-editor');
  const {promptColumn,outputColumn}=batch;
  if(!table || promptColumn===undefined || outputColumn===undefined || !Number.isInteger(outputColumn) || outputColumn<0 || promptColumn===outputColumn || outputColumn>=(table.tableColumns?.length || 0))throw Error('本批次未绑定有效输出列，请保留结果并核对来源表格');
  if(batch.tableColumns && JSON.stringify(batch.tableColumns)!==JSON.stringify(table.tableColumns))throw Error('表格列已调整，未写入结果；请手动放入画布');
  const rows=(table.tableRows || []).map(row=>[...row]);
  const completed=batch.rows.filter(row=>row.status==='succeeded' && row.result);
  if(!completed.length)throw Error('还没有可写入的成功图片');
  for(const row of completed){
    const index=row.sourceRowIndex;
    if(index===undefined || !Number.isInteger(index) || index<0 || rows[index]?.[promptColumn]?.trim()!==row.prompt)throw Error('来源行已修改或移动，未写入结果；请手动放入画布');
    const current=rows[index][outputColumn] || '';
    if(current!==(row.outputBaseline || '') && current!==row.result)throw Error(`第 ${index+1} 行输出已修改，未覆盖现有内容`);
    rows[index][outputColumn]=row.result!;
  }
  return elements.map(item=>item.id===table.id?{...item,tableRows:rows}:item);
}
