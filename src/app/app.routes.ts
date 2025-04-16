import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { MainpageComponent } from './mainpage/mainpage.component';
import { MasterspageComponent } from './masterspage/masterspage.component';
import { ContactsComponent } from './contacts/contacts.component';

export const routes: Routes = [
  { path: '', redirectTo: '/mainpage', pathMatch: 'full' },
  { path: 'mainpage', component: MainpageComponent },
  { path: 'masterspage', component: MasterspageComponent },
  { path: 'contacts', component: ContactsComponent },
  { path: '**', redirectTo: '/mainpage' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }